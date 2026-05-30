import { Component, Input } from '@angular/core';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { ComponentInfo } from 'sailpoint-components';

@Component({
  selector: 'app-installed-tools-card',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, MatIconModule, CommonModule],
  templateUrl: './installed-tools-card.component.html',
  styleUrl: './installed-tools-card.component.scss',
})
export class InstalledToolsCardComponent {
  @Input() components: ComponentInfo[] = [];

  constructor(private readonly router: Router) {}

  launch(comp: ComponentInfo): void {
    void this.router.navigate(['/' + comp.route]);
  }
}
