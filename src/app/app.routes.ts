import { Routes } from '@angular/router';
import { ThemePickerComponent, TransformBuilderComponent, TransformsComponent } from 'sailpoint-components';
import { HomeComponent } from './home/home.component';
import { PageNotFoundComponent } from './shared/components';

export const appRoutes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: 'home',
    component: HomeComponent
  },
  {
    path: 'theme-picker',
    component: ThemePickerComponent
  },
  {
    path: 'transforms',
    component: TransformsComponent
  },
  {
    path: 'transform-builder',
    component: TransformBuilderComponent
  },
  {
    path: 'component-selector',
    loadComponent: () => import('./component-selector/component-selector.component').then(m => m.ComponentSelectorComponent)
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];
