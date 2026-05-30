import { Component, OnInit } from '@angular/core';
import { SailPointSDKService } from 'sailpoint-components';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-roles-count',
  standalone: true,
  imports: [MatCardModule, MatProgressSpinnerModule],
  template: `
    <mat-card>
      <mat-card-header>
        <mat-card-title>Roles</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (loading) {
          <div class="loading-container">
            <mat-spinner diameter="40"></mat-spinner>
          </div>
        } @else {
          <p class="roles-count">{{ count }}</p>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .loading-container { display: flex; justify-content: center; padding: 24px; }
    .roles-count { font-size: 2.5rem; font-weight: 300; text-align: center; margin: 16px 0; color: var(--primary-color, #1976d2); }
  `]
})
export class RolesCountComponent implements OnInit {
  count = 0;
  loading = true;

  constructor(private readonly sdk: SailPointSDKService) {}

  ngOnInit(): void { void this.load(); }

  private async load(): Promise<void> {
    this.loading = true;
    try {
      const resp = await this.sdk.listRoles({ count: true, limit: 1 });
      this.count = Number(resp?.headers?.['x-total-count'] ?? 0);
    } catch { this.count = 0; }
    finally { this.loading = false; }
  }
}
