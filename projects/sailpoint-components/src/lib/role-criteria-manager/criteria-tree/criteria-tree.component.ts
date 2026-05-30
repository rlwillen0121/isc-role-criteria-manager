import {
  AfterViewInit,
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTree, MatTreeModule } from '@angular/material/tree';
import { CriteriaNode, leafValues } from '../models/criteria.model';

/**
 * Presentational `MatTree` rendering of a single criteria {@link CriteriaNode}.
 *
 * Stateless aside from expansion: the parent passes a `node` and an optional
 * `variant` used to tint the tree (e.g. the proposed/after tree in the preview
 * panel). All criteria mutation lives in the pure model — this component only
 * displays.
 */
@Component({
  selector: 'app-criteria-tree',
  standalone: true,
  imports: [MatTreeModule, MatIconModule, MatButtonModule],
  templateUrl: './criteria-tree.component.html',
  styleUrl: './criteria-tree.component.scss',
})
export class CriteriaTreeComponent implements OnChanges, AfterViewInit {
  /** Root of the criteria tree to render (`null` renders an empty state). */
  @Input() node: CriteriaNode | null = null;

  /** Visual tint for diff context. */
  @Input() variant: 'plain' | 'added' | 'removed' = 'plain';

  @ViewChild('tree') tree?: MatTree<CriteriaNode>;

  /** MatTree data source — the single root wrapped in an array. */
  roots: CriteriaNode[] = [];

  readonly childrenAccessor = (n: CriteriaNode): CriteriaNode[] =>
    n.children ?? [];

  readonly hasChild = (_: number, n: CriteriaNode): boolean =>
    !!n.children && n.children.length > 0;

  ngOnChanges(changes: SimpleChanges): void {
    if ('node' in changes) {
      this.roots = this.node ? [this.node] : [];
      this.expandLater();
    }
  }

  ngAfterViewInit(): void {
    this.expandLater();
  }

  /** Defer expansion until the tree has rendered the (re)assigned data. */
  private expandLater(): void {
    setTimeout(() => this.tree?.expandAll());
  }

  /** Comma-joined leaf values for display (∅ when the leaf has no value). */
  leafValueText(node: CriteriaNode): string {
    const values = leafValues(node);
    return values.length ? values.join(', ') : '∅';
  }
}
