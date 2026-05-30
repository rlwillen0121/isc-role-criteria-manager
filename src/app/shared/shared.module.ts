import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslateModule } from '@ngx-translate/core';

import { PageNotFoundComponent } from './components/';
import { WebviewDirective } from './directives/';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatCardModule } from '@angular/material/card';
import { DragDropModule } from '@angular/cdk/drag-drop'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';

@NgModule({
  declarations: [],
  imports: [CommonModule, TranslateModule, FormsModule, WebviewDirective, PageNotFoundComponent, MatFormFieldModule, MatSelectModule, MatCardModule, DragDropModule, MatSelectModule, MatProgressSpinnerModule, MatIconModule, MatGridListModule],
  exports: [TranslateModule, WebviewDirective, FormsModule, PageNotFoundComponent, WebviewDirective, MatFormFieldModule, MatSelectModule, MatCardModule, MatProgressSpinnerModule, DragDropModule, MatIconModule, MatGridListModule]
})
export class SharedModule {}
