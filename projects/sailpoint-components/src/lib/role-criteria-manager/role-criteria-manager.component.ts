import { ChangeDetectorRef, Component, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { StepperSelectionEvent } from '@angular/cdk/stepper';
import { MatStepper, MatStepperModule } from '@angular/material/stepper';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import type { RoleV2025 } from 'sailpoint-api-client';

import { GenericDialogComponent } from '../generic-dialog/generic-dialog.component';
import { SailPointSDKService } from '../sailpoint-sdk.service';
import { ElectronApiFactoryService } from '../services/electron-api-factory.service';
import { CriteriaTreeComponent } from './criteria-tree/criteria-tree.component';
import {
  collectLeafAttributes,
  countNodes,
  CriteriaNode,
  LEAF_OPERATIONS,
  LeafOperation,
  MembershipSelector,
  parseCriteria,
} from './models/criteria.model';
import {
  applyOperation,
  OperationParams,
  OperationResult,
} from './models/criteria-operations';

/** A role row shown in the Target panel table. */
interface RoleRow {
  id: string;
  name: string;
  membershipType: string;
  nodeCount: number;
  selected: boolean;
  role: RoleV2025;
}

/** Per-role computed preview for the Preview panel. */
interface RolePreview {
  row: RoleRow;
  before: CriteriaNode | null;
  result: OperationResult;
}

/** Per-role outcome shown in the Results panel. */
interface RunResult {
  role: string;
  id: string;
  status: 'Updated' | 'Skipped' | 'Error';
  detail?: string;
}

type OperationTab =
  | 'update'
  | 'add-values'
  | 'add-block'
  | 'remove'
  | 'consolidate';

const PAGE_SIZE = 250;
const LARGE_RESULT_THRESHOLD = 1000;

/**
 * Bulk-edits ISC role membership criteria through a guided, safe-by-default
 * four-panel flow (Target → Operation → Preview → Results). All criteria
 * mutation is delegated to the pure model under `./models`; this container only
 * orchestrates SDK calls, the snapshot-before-write safety step, and the
 * stepper UI.
 */
@Component({
  selector: 'app-role-criteria-manager',
  standalone: true,
  imports: [
    FormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatStepperModule,
    MatTableModule,
    MatTabsModule,
    MatToolbarModule,
    CriteriaTreeComponent,
  ],
  templateUrl: './role-criteria-manager.component.html',
  styleUrl: './role-criteria-manager.component.scss',
})
export class RoleCriteriaManagerComponent {
  @ViewChild('stepper') stepper?: MatStepper;

  // ----- Panel 1: Target -----
  mode: 'single' | 'bulk' = 'single';
  searchText = '';
  roleRows: RoleRow[] = [];
  searching = false;
  searched = false;
  readonly displayedColumns = ['select', 'name', 'id', 'membershipType', 'nodeCount'];

  // ----- Panel 2: Operation -----
  selectedTabIndex = 0;
  attributeOptions: string[] = [];
  loadingDetails = false;
  private readonly roleCache = new Map<string, RoleV2025>();

  readonly leafOperations: readonly LeafOperation[] = LEAF_OPERATIONS;

  updateForm = { attribute: '', oldValue: '', newValues: '' };
  addValuesForm = { attribute: '', addValues: '' };
  addBlockForm = {
    attribute: '',
    operation: 'EQUALS' as LeafOperation,
    values: '',
    join: 'AND' as 'AND' | 'OR',
  };
  removeForm = {
    attribute: '',
    mode: 'value' as 'value' | 'attribute',
    value: '',
  };
  consolidateForm = { attribute: '' };

  // ----- Panel 3: Preview -----
  previews: RolePreview[] = [];
  dryRun = true;
  snapshot = true;

  // ----- Panel 4: Results -----
  executing = false;
  hasExecuted = false;
  results: RunResult[] = [];
  private snapshotContent = '';
  private snapshotFilename = '';

  constructor(
    private readonly sdk: SailPointSDKService,
    private readonly apiFactory: ElectronApiFactoryService,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
    private readonly cdr: ChangeDetectorRef
  ) {}

  private get api(): {
    saveFile: (options: {
      defaultPath?: string;
      content: string;
    }) => Promise<{
      success: boolean;
      canceled?: boolean;
      filePath?: string;
      error?: string;
    }>;
  } {
    return this.apiFactory.getApi() as never;
  }

  // ===========================================================================
  // Panel 1 — Target
  // ===========================================================================

  get activeOperation(): OperationTab {
    return (['update', 'add-values', 'add-block', 'remove', 'consolidate'] as const)[
      this.selectedTabIndex
    ];
  }

  selectedRoles(): RoleRow[] {
    return this.roleRows.filter((r) => r.selected);
  }

  allSelected(): boolean {
    return this.roleRows.length > 0 && this.roleRows.every((r) => r.selected);
  }

  someSelected(): boolean {
    return this.roleRows.some((r) => r.selected) && !this.allSelected();
  }

  toggleAll(checked: boolean): void {
    this.roleRows.forEach((r) => (r.selected = checked));
  }

  async findRoles(): Promise<void> {
    const text = this.searchText.trim();
    if (!text) {
      this.snackBar.open('Enter a role name to search.', 'Close', {
        duration: 3000,
      });
      return;
    }

    this.searching = true;
    this.searched = false;
    this.roleRows = [];
    this.roleCache.clear();
    this.cdr.detectChanges();

    const escaped = text.replace(/"/g, '\\"');
    const filter =
      this.mode === 'single' ? `name eq "${escaped}"` : `name co "${escaped}"`;

    try {
      let roles = await this.fetchAllRoles(filter);

      // Single-role safety clamp — never silently act on more than one role.
      if (this.mode === 'single' && roles.length > 1) {
        this.snackBar.open(
          `Single-role mode matched ${roles.length} roles; using only the first ("${roles[0].name}").`,
          'Close',
          { duration: 6000 }
        );
        roles = [roles[0]];
      }

      this.roleRows = roles.map((role) => {
        const criteria = parseCriteria(role.membership?.criteria ?? null);
        return {
          id: role.id ?? '',
          name: role.name ?? '(unnamed)',
          membershipType: role.membership?.type ?? '—',
          nodeCount: countNodes(criteria),
          selected: this.mode === 'single',
          role,
        };
      });

      if (this.roleRows.length === 0) {
        this.snackBar.open('No roles matched.', 'Close', { duration: 3000 });
      }
    } catch (err) {
      this.snackBar.open(
        `Failed to fetch roles: ${this.extractError(err)}`,
        'Close',
        { duration: 6000 }
      );
    } finally {
      this.searching = false;
      this.searched = true;
      this.cdr.detectChanges();
    }
  }

  /**
   * Page through `listRoles` accumulating all matches. Pages until an empty
   * page is returned, advancing the offset by each page's actual length. This
   * is correct regardless of whether the server honors the requested page size
   * or clamps it (the v2025 roles endpoint caps `limit` at 50), at the cost of
   * one trailing empty request. Prompts for confirmation once the result set
   * grows beyond ~1000.
   */
  private async fetchAllRoles(filters: string): Promise<RoleV2025[]> {
    const all: RoleV2025[] = [];
    let offset = 0;
    let confirmedLarge = false;

    for (let guard = 0; guard < 2000; guard++) {
      const resp = await this.sdk.listRoles({
        filters,
        limit: PAGE_SIZE,
        offset,
      });
      if (resp?.status !== undefined && resp.status >= 400) {
        throw resp;
      }
      const page = Array.isArray(resp?.data) ? resp.data : [];
      if (page.length === 0) {
        break;
      }
      all.push(...page);
      offset += page.length;

      if (all.length > LARGE_RESULT_THRESHOLD && !confirmedLarge) {
        const proceed = await this.confirm(
          'Large result set',
          `Over ${LARGE_RESULT_THRESHOLD} roles match this filter and more remain. ` +
            `Continue loading all of them?`,
          'Continue',
          'Stop here'
        );
        if (!proceed) {
          this.snackBar.open(
            `Stopped loading at ${all.length} roles.`,
            'Close',
            { duration: 5000 }
          );
          break;
        }
        confirmedLarge = true;
      }
    }
    return all;
  }

  // ===========================================================================
  // Panel 2 — Operation
  // ===========================================================================

  onStepChange(event: StepperSelectionEvent): void {
    if (event.selectedIndex === 1) {
      void this.loadSelectedDetails();
    } else if (event.selectedIndex === 2) {
      this.computePreviews();
    }
  }

  /** Fetch full detail for the selected roles and build the attribute list. */
  private async loadSelectedDetails(): Promise<void> {
    this.loadingDetails = true;
    this.cdr.detectChanges();
    try {
      for (const row of this.selectedRoles()) {
        if (!this.roleCache.has(row.id)) {
          try {
            const resp = await this.sdk.getRole({ id: row.id });
            if (resp?.data) {
              this.roleCache.set(row.id, resp.data);
            }
          } catch (err) {
            this.snackBar.open(
              `Could not load "${row.name}": ${this.extractError(err)}`,
              'Close',
              { duration: 5000 }
            );
          }
        }
      }
      this.attributeOptions = this.computeAttributeOptions();
    } finally {
      this.loadingDetails = false;
      this.cdr.detectChanges();
    }
  }

  private computeAttributeOptions(): string[] {
    const set = new Set<string>();
    for (const row of this.selectedRoles()) {
      const full = this.roleCache.get(row.id);
      const criteria = parseCriteria(full?.membership?.criteria ?? null);
      collectLeafAttributes(criteria).forEach((a) => set.add(a));
    }
    return [...set].sort();
  }

  /** Attribute options filtered by the current input value. */
  filterAttributes(query: string): string[] {
    const q = (query ?? '').toLowerCase().trim();
    if (!q) {
      return this.attributeOptions;
    }
    return this.attributeOptions.filter((a) => a.toLowerCase().includes(q));
  }

  private splitValues(input: string): string[] {
    return (input ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /** Build the operation parameters for the active tab, or null if invalid. */
  buildParams(): OperationParams | null {
    switch (this.activeOperation) {
      case 'update': {
        const { attribute, oldValue } = this.updateForm;
        const newValues = this.splitValues(this.updateForm.newValues);
        if (!attribute || !oldValue || newValues.length === 0) {
          return null;
        }
        return { type: 'update', params: { attribute, oldValue, newValues } };
      }
      case 'add-values': {
        const { attribute } = this.addValuesForm;
        const addValues = this.splitValues(this.addValuesForm.addValues);
        if (!attribute || addValues.length === 0) {
          return null;
        }
        return { type: 'add-values', params: { attribute, addValues } };
      }
      case 'add-block': {
        const { attribute, operation, join } = this.addBlockForm;
        const values = this.splitValues(this.addBlockForm.values);
        if (!attribute || values.length === 0) {
          return null;
        }
        return {
          type: 'add-block',
          params: { attribute, operation, values, join },
        };
      }
      case 'remove': {
        const { attribute, mode, value } = this.removeForm;
        if (!attribute) {
          return null;
        }
        if (mode === 'value' && !value) {
          return null;
        }
        return { type: 'remove', params: { attribute, mode, value } };
      }
      case 'consolidate': {
        const { attribute } = this.consolidateForm;
        if (!attribute) {
          return null;
        }
        return { type: 'consolidate', params: { attribute } };
      }
    }
  }

  // ===========================================================================
  // Panel 3 — Preview
  // ===========================================================================

  computePreviews(): void {
    const params = this.buildParams();
    if (!params) {
      this.previews = [];
      this.snackBar.open(
        'Complete the operation fields before previewing.',
        'Close',
        { duration: 4000 }
      );
      return;
    }

    this.previews = this.selectedRoles().map((row) => {
      const full = this.roleCache.get(row.id);
      const membership: MembershipSelector = {
        type: full?.membership?.type ?? null,
        criteria: parseCriteria(full?.membership?.criteria ?? null),
        identities: full?.membership?.identities ?? null,
      };
      return {
        row,
        before: membership.criteria ?? null,
        result: applyOperation(membership, params),
      };
    });
  }

  actionablePreviews(): RolePreview[] {
    return this.previews.filter((p) => p.result.status === 'ready');
  }

  skippedPreviews(): RolePreview[] {
    return this.previews.filter((p) => p.result.status === 'skipped');
  }

  get canExecute(): boolean {
    return (
      !this.dryRun &&
      !this.executing &&
      this.actionablePreviews().length > 0
    );
  }

  // ===========================================================================
  // Panel 4 — Execute / Results
  // ===========================================================================

  async execute(): Promise<void> {
    if (this.dryRun) {
      return;
    }
    const actionable = this.actionablePreviews();
    if (actionable.length === 0) {
      this.snackBar.open('Nothing to execute.', 'Close', { duration: 3000 });
      return;
    }

    // Snapshot BEFORE any write — cancelling the save aborts the whole run.
    if (this.snapshot) {
      const saved = await this.saveSnapshot(actionable);
      if (!saved) {
        this.snackBar.open(
          'Run aborted — pre-run snapshot was not saved.',
          'Close',
          { duration: 5000 }
        );
        return;
      }
    }

    const confirmed = await this.confirm(
      'Apply changes',
      `Patch membership criteria on ${actionable.length} role(s)? This writes to the tenant.`,
      'Apply',
      'Cancel'
    );
    if (!confirmed) {
      return;
    }

    this.executing = true;
    this.results = [];
    this.cdr.detectChanges();

    for (const preview of this.skippedPreviews()) {
      this.results.push({
        role: preview.row.name,
        id: preview.row.id,
        status: 'Skipped',
        detail: preview.result.reason,
      });
    }

    for (const preview of actionable) {
      try {
        await this.sdk.patchRole({
          id: preview.row.id,
          jsonPatchOperationV2025: preview.result.patch as never,
        });
        this.results.push({
          role: preview.row.name,
          id: preview.row.id,
          status: 'Updated',
        });
      } catch (err) {
        this.results.push({
          role: preview.row.name,
          id: preview.row.id,
          status: 'Error',
          detail: this.extractError(err),
        });
      }
    }

    this.executing = false;
    this.hasExecuted = true;
    this.cdr.detectChanges();
    this.stepper?.next();
  }

  /** Save a pre-run snapshot of the actionable roles' membership. */
  private async saveSnapshot(actionable: RolePreview[]): Promise<boolean> {
    const snapshot = actionable.map((p) => {
      const full = this.roleCache.get(p.row.id);
      return {
        id: p.row.id,
        name: p.row.name,
        membership: full?.membership ?? p.row.role.membership ?? null,
      };
    });
    this.snapshotContent = JSON.stringify(snapshot, null, 2);
    this.snapshotFilename = `role-criteria-snapshot-${this.timestamp()}.json`;

    try {
      const res = await this.api.saveFile({
        defaultPath: this.snapshotFilename,
        content: this.snapshotContent,
      });
      if (!res?.success) {
        if (res?.canceled) {
          return false;
        }
        this.snackBar.open(
          `Snapshot save failed: ${res?.error ?? 'unknown error'}`,
          'Close',
          { duration: 5000 }
        );
        return false;
      }
      this.snackBar.open(
        res.filePath ? `Snapshot saved: ${res.filePath}` : 'Snapshot saved.',
        'Close',
        { duration: 4000 }
      );
      return true;
    } catch {
      this.snackBar.open('Snapshot save failed.', 'Close', { duration: 5000 });
      return false;
    }
  }

  get hasSnapshot(): boolean {
    return this.snapshotContent.length > 0;
  }

  /** Re-download the last snapshot (Results-panel fallback). */
  async redownloadSnapshot(): Promise<void> {
    if (!this.snapshotContent) {
      return;
    }
    try {
      await this.api.saveFile({
        defaultPath: this.snapshotFilename,
        content: this.snapshotContent,
      });
    } catch {
      this.snackBar.open('Snapshot download failed.', 'Close', {
        duration: 4000,
      });
    }
  }

  runAgain(): void {
    this.previews = [];
    this.results = [];
    this.hasExecuted = false;
    this.dryRun = true;
    if (this.stepper) {
      this.stepper.selectedIndex = 1;
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    return (
      `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
      `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
    );
  }

  private confirm(
    title: string,
    message: string,
    confirmText: string,
    cancelText: string
  ): Promise<boolean> {
    const ref = this.dialog.open(GenericDialogComponent, {
      data: {
        title,
        message,
        isConfirmation: true,
        confirmText,
        cancelText,
      },
      disableClose: true,
    });
    return ref
      .afterClosed()
      .toPromise()
      .then((value) => value === true);
  }

  /** Extract a readable message from an ISC / SDK error response. */
  private extractError(err: unknown): string {
    const e = err as {
      response?: { data?: unknown };
      data?: unknown;
      messages?: { text?: string }[];
      detailCode?: string;
      trackingId?: string;
      message?: string;
    };
    const data = (e?.response?.data ?? e?.data ?? e) as {
      messages?: { text?: string }[];
      detailCode?: string;
      trackingId?: string;
      message?: string;
    };
    const parts: string[] = [];
    const primary =
      data?.messages?.[0]?.text ?? data?.message ?? e?.message ?? 'Unknown error';
    parts.push(primary);
    if (data?.detailCode) {
      parts.push(`detailCode: ${data.detailCode}`);
    }
    if (data?.trackingId) {
      parts.push(`trackingId: ${data.trackingId}`);
    }
    return parts.join(' | ');
  }
}
