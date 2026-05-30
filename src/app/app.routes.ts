import { Routes } from '@angular/router';
import { ThemePickerComponent } from 'sailpoint-components';
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
    path: 'role-criteria-manager',
    loadComponent: () => import('sailpoint-components').then(m => m.RoleCriteriaManagerComponent)
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
