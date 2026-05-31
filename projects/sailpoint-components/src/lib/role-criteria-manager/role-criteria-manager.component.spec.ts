import { RoleCriteriaManagerComponent } from './role-criteria-manager.component';

/**
 * These specs drive the container's orchestration logic directly with mocked
 * collaborators (SDK, save-file API, dialog, snackbar). Rendering is covered
 * by the production builds; here we assert the SDK call shapes, the
 * snapshot-before-write gate, and per-role result recording.
 */
describe('RoleCriteriaManagerComponent', () => {
  let sdk: {
    listRoles: jest.Mock;
    getRole: jest.Mock;
    patchRole: jest.Mock;
  };
  let saveFile: jest.Mock;
  let apiFactory: { getApi: jest.Mock };
  let dialog: { open: jest.Mock };
  let snackBar: { open: jest.Mock };
  let cdr: { detectChanges: jest.Mock };
  let component: RoleCriteriaManagerComponent;

  function makeRole(id: string, name: string, criteria: unknown) {
    return {
      id,
      name,
      membership: { type: 'STANDARD', criteria, identities: null },
    };
  }

  function dialogResult(value: unknown) {
    return { afterClosed: () => ({ toPromise: () => Promise.resolve(value) }) };
  }

  beforeEach(() => {
    sdk = {
      listRoles: jest.fn(),
      getRole: jest.fn(),
      patchRole: jest.fn().mockResolvedValue({ data: {} }),
    };
    saveFile = jest.fn().mockResolvedValue({ success: true, filePath: '/tmp/s.json' });
    apiFactory = { getApi: jest.fn().mockReturnValue({ saveFile }) };
    dialog = { open: jest.fn().mockReturnValue(dialogResult(true)) };
    snackBar = { open: jest.fn() };
    cdr = { detectChanges: jest.fn() };

    component = new RoleCriteriaManagerComponent(
      sdk as never,
      apiFactory as never,
      dialog as never,
      snackBar as never,
      cdr as never
    );
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  describe('findRoles', () => {
    it('populates rows and auto-selects in single mode', async () => {
      const role = makeRole('r1', 'Engineering', {
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.dept' },
        stringValue: 'eng',
      });
      sdk.listRoles.mockResolvedValueOnce({ data: [role] });

      component.mode = 'single';
      component.searchText = 'Engineering';
      await component.findRoles();

      expect(sdk.listRoles).toHaveBeenCalledWith({
        filters: 'name eq "Engineering"',
        limit: 250,
        offset: 0,
      });
      expect(component.roleRows).toHaveLength(1);
      expect(component.roleRows[0].selected).toBe(true);
      expect(component.roleRows[0].nodeCount).toBe(1);
      expect(component.roleRows[0].membershipType).toBe('STANDARD');
    });

    it('clamps single mode to the first role when several match', async () => {
      sdk.listRoles.mockResolvedValueOnce({
        data: [makeRole('a', 'Dup', null), makeRole('b', 'Dup', null)],
      });
      component.mode = 'single';
      component.searchText = 'Dup';
      await component.findRoles();

      expect(component.roleRows).toHaveLength(1);
      expect(component.roleRows[0].id).toBe('a');
      expect(snackBar.open).toHaveBeenCalled();
    });

    it('uses a contains filter in bulk mode', async () => {
      sdk.listRoles.mockResolvedValueOnce({ data: [] });
      component.mode = 'bulk';
      component.searchText = 'DL';
      await component.findRoles();
      expect(sdk.listRoles).toHaveBeenCalledWith({
        filters: 'name co "DL"',
        limit: 250,
        offset: 0,
      });
    });
  });

  describe('buildParams', () => {
    it('builds update params and splits comma values', () => {
      component.selectedTabIndex = 0;
      component.updateForm = {
        attribute: 'attribute.x',
        oldValue: '011',
        newValues: '012, 013',
      };
      expect(component.buildParams()).toEqual({
        type: 'update',
        params: {
          attribute: 'attribute.x',
          oldValue: '011',
          newValues: ['012', '013'],
        },
      });
    });

    it('returns null when required fields are missing', () => {
      component.selectedTabIndex = 0;
      component.updateForm = { attribute: '', oldValue: '', newValues: '' };
      expect(component.buildParams()).toBeNull();
    });

    it('requires a value only when remove mode is value', () => {
      component.selectedTabIndex = 3;
      component.removeForm = { attribute: 'attribute.x', mode: 'attribute', value: '' };
      expect(component.buildParams()).not.toBeNull();
      component.removeForm = { attribute: 'attribute.x', mode: 'value', value: '' };
      expect(component.buildParams()).toBeNull();
    });

    it('builds consolidate params', () => {
      component.selectedTabIndex = 4;
      component.consolidateForm = { attribute: 'attribute.state' };
      expect(component.buildParams()).toEqual({
        type: 'consolidate',
        params: { attribute: 'attribute.state' },
      });
    });
  });

  describe('computePreviews', () => {
    it('produces a ready preview with the expected patch', () => {
      component.roleRows = [
        {
          id: 'r1',
          name: 'Eng',
          membershipType: 'STANDARD',
          nodeCount: 1,
          selected: true,
          role: makeRole('r1', 'Eng', null) as never,
        },
      ];
      // seed the cache via getRole-equivalent path
      (component as never as { roleCache: Map<string, unknown> }).roleCache.set(
        'r1',
        makeRole('r1', 'Eng', {
          operation: 'EQUALS',
          key: { type: 'IDENTITY', property: 'attribute.dept' },
          stringValue: 'eng',
        })
      );
      component.selectedTabIndex = 0;
      component.updateForm = {
        attribute: 'attribute.dept',
        oldValue: 'eng',
        newValues: 'sales',
      };
      component.computePreviews();

      expect(component.previews).toHaveLength(1);
      expect(component.actionablePreviews()).toHaveLength(1);
      expect(component.previews[0].result.patch[0]).toMatchObject({
        op: 'replace',
        path: '/membership',
      });
    });
  });

  describe('simulate', () => {
    function seedRows(ids: string[], selectedIds: Set<string>) {
      component.roleRows = ids.map((id) => ({
        id,
        name: id,
        membershipType: 'STANDARD',
        nodeCount: 1,
        selected: selectedIds.has(id),
        role: makeRole(id, id, null) as never,
      }));
      const cache = (component as never as { roleCache: Map<string, unknown> }).roleCache;
      for (const id of ids) {
        cache.set(id, makeRole(id, id, {
          operation: 'EQUALS',
          key: { type: 'IDENTITY', property: 'attribute.dept' },
          stringValue: 'eng',
        }));
      }
    }

    beforeEach(() => {
      component.selectedTabIndex = 0;
      component.updateForm = { attribute: 'attribute.dept', oldValue: 'eng', newValues: 'sales' };
    });

    it('counts only selected roles — 1 of 3 selected yields total 1', async () => {
      seedRows(['r1', 'r2', 'r3'], new Set(['r2']));
      await component.simulate();
      expect(component.simulationResults?.total).toBe(1);
    });

    it('counts all three when all are selected', async () => {
      seedRows(['r1', 'r2', 'r3'], new Set(['r1', 'r2', 'r3']));
      await component.simulate();
      expect(component.simulationResults?.total).toBe(3);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      component.roleRows = [
        {
          id: 'r1',
          name: 'Eng',
          membershipType: 'STANDARD',
          nodeCount: 1,
          selected: true,
          role: makeRole('r1', 'Eng', null) as never,
        },
      ];
      (component as never as { roleCache: Map<string, unknown> }).roleCache.set(
        'r1',
        makeRole('r1', 'Eng', {
          operation: 'EQUALS',
          key: { type: 'IDENTITY', property: 'attribute.dept' },
          stringValue: 'eng',
        })
      );
      component.selectedTabIndex = 0;
      component.updateForm = {
        attribute: 'attribute.dept',
        oldValue: 'eng',
        newValues: 'sales',
      };
      component.computePreviews();
      component.dryRun = false;
    });

    it('is blocked while dry run is on', async () => {
      component.dryRun = true;
      await component.execute();
      expect(sdk.patchRole).not.toHaveBeenCalled();
    });

    it('saves a snapshot and patches each role', async () => {
      await component.execute();

      expect(saveFile).toHaveBeenCalledTimes(1);
      expect(sdk.patchRole).toHaveBeenCalledWith({
        id: 'r1',
        jsonPatchOperationV2025: expect.arrayContaining([
          expect.objectContaining({ op: 'replace', path: '/membership' }),
        ]),
      });
      expect(component.results).toEqual([
        expect.objectContaining({ role: 'Eng', status: 'Updated' }),
      ]);
    });

    it('aborts the run when the snapshot save is cancelled', async () => {
      saveFile.mockResolvedValueOnce({ success: false, canceled: true });
      await component.execute();
      expect(sdk.patchRole).not.toHaveBeenCalled();
      expect(component.results).toEqual([]);
    });

    it('records an ISC error with detail when patchRole fails', async () => {
      sdk.patchRole.mockRejectedValueOnce({
        response: {
          data: {
            messages: [{ text: 'Bad criteria' }],
            detailCode: '400.1',
            trackingId: 'abc123',
          },
        },
      });
      await component.execute();
      expect(component.results[0]).toMatchObject({
        status: 'Error',
        detail: expect.stringContaining('Bad criteria'),
      });
      expect(component.results[0].detail).toContain('abc123');
    });

    it('does not save a snapshot when the toggle is off', async () => {
      component.snapshot = false;
      await component.execute();
      expect(saveFile).not.toHaveBeenCalled();
      expect(sdk.patchRole).toHaveBeenCalled();
    });
  });
});
