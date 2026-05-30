import {
  applyValueInvariant,
  buildLeafNode,
  cloneCriteria,
  collectLeafAttributes,
  countNodes,
  CriteriaNode,
  isComposite,
  isLeaf,
  leafValues,
  parseCriteria,
} from './criteria.model';

describe('criteria.model', () => {
  describe('parseCriteria', () => {
    it('returns null for nullish / non-object input', () => {
      expect(parseCriteria(null)).toBeNull();
      expect(parseCriteria(undefined)).toBeNull();
      expect(parseCriteria('nope')).toBeNull();
    });

    it('normalizes a single-value leaf into stringValue', () => {
      const raw = {
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.dept' },
        stringValue: 'sales',
      };
      expect(parseCriteria(raw)).toEqual({
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.dept' },
        stringValue: 'sales',
      });
    });

    it('normalizes a multi-value leaf into values[]', () => {
      const raw = {
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.state' },
        values: ['active', 'loa'],
      };
      expect(parseCriteria(raw)).toEqual({
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.state' },
        values: ['active', 'loa'],
      });
    });

    it('preserves sourceId only when present', () => {
      const withSource = parseCriteria({
        operation: 'EQUALS',
        key: { type: 'ACCOUNT', property: 'memberOf', sourceId: 'src-1' },
        stringValue: 'x',
      });
      expect(withSource?.key).toEqual({
        type: 'ACCOUNT',
        property: 'memberOf',
        sourceId: 'src-1',
      });

      const withoutSource = parseCriteria({
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.dept', sourceId: null },
        stringValue: 'x',
      });
      expect(withoutSource?.key).toEqual({
        type: 'IDENTITY',
        property: 'attribute.dept',
      });
    });

    it('normalizes a composite tree recursively', () => {
      const raw = {
        operation: 'AND',
        children: [
          {
            operation: 'EQUALS',
            key: { type: 'IDENTITY', property: 'attribute.a' },
            stringValue: '1',
          },
          {
            operation: 'OR',
            children: [
              {
                operation: 'EQUALS',
                key: { type: 'IDENTITY', property: 'attribute.b' },
                values: ['x', 'y'],
              },
            ],
          },
        ],
      };
      const parsed = parseCriteria(raw);
      expect(parsed).toEqual(raw);
    });

    it('deep-clones so mutating the result does not touch the input', () => {
      const raw = {
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.a' },
        values: ['1', '2'],
      };
      const parsed = parseCriteria(raw)!;
      parsed.values!.push('3');
      expect(raw.values).toEqual(['1', '2']);
    });
  });

  describe('isComposite / isLeaf', () => {
    it('classifies AND/OR as composite and comparisons as leaf', () => {
      expect(isComposite({ operation: 'AND', children: [] })).toBe(true);
      expect(isComposite({ operation: 'OR', children: [] })).toBe(true);
      expect(isLeaf({ operation: 'EQUALS', stringValue: 'x' })).toBe(true);
      expect(isLeaf({ operation: 'CONTAINS', stringValue: 'x' })).toBe(true);
      expect(isComposite({ operation: 'EQUALS', stringValue: 'x' })).toBe(false);
    });
  });

  describe('cloneCriteria', () => {
    it('produces an independent deep copy', () => {
      const node: CriteriaNode = {
        operation: 'AND',
        children: [{ operation: 'EQUALS', stringValue: 'x' }],
      };
      const clone = cloneCriteria(node);
      expect(clone).toEqual(node);
      expect(clone).not.toBe(node);
      expect(clone.children![0]).not.toBe(node.children![0]);
    });
  });

  describe('applyValueInvariant', () => {
    it('collapses a single value to stringValue and clears values', () => {
      const node: CriteriaNode = {
        operation: 'EQUALS',
        values: ['a', 'b'],
      };
      applyValueInvariant(node, ['only']);
      expect(node.stringValue).toBe('only');
      expect(node.values).toBeUndefined();
    });

    it('expands two or more values into values[] and clears stringValue', () => {
      const node: CriteriaNode = { operation: 'EQUALS', stringValue: 'a' };
      applyValueInvariant(node, ['a', 'b']);
      expect(node.values).toEqual(['a', 'b']);
      expect(node.stringValue).toBeUndefined();
    });
  });

  describe('leafValues', () => {
    it('reads values[] when present', () => {
      expect(leafValues({ operation: 'EQUALS', values: ['a', 'b'] })).toEqual([
        'a',
        'b',
      ]);
    });
    it('reads stringValue when set', () => {
      expect(leafValues({ operation: 'EQUALS', stringValue: 'a' })).toEqual([
        'a',
      ]);
    });
    it('returns empty for an unset / empty leaf', () => {
      expect(leafValues({ operation: 'EQUALS' })).toEqual([]);
      expect(leafValues({ operation: 'EQUALS', stringValue: '' })).toEqual([]);
      expect(leafValues({ operation: 'EQUALS', values: [] })).toEqual([]);
    });
  });

  describe('collectLeafAttributes', () => {
    it('collects distinct leaf properties in first-seen order', () => {
      const tree: CriteriaNode = {
        operation: 'AND',
        children: [
          {
            operation: 'EQUALS',
            key: { type: 'IDENTITY', property: 'attribute.b' },
            stringValue: '1',
          },
          {
            operation: 'OR',
            children: [
              {
                operation: 'EQUALS',
                key: { type: 'IDENTITY', property: 'attribute.a' },
                stringValue: '2',
              },
              {
                operation: 'EQUALS',
                key: { type: 'IDENTITY', property: 'attribute.b' },
                stringValue: '3',
              },
            ],
          },
        ],
      };
      expect(collectLeafAttributes(tree)).toEqual(['attribute.b', 'attribute.a']);
    });
    it('returns empty for null', () => {
      expect(collectLeafAttributes(null)).toEqual([]);
    });
  });

  describe('countNodes', () => {
    it('counts composites and leaves', () => {
      const tree: CriteriaNode = {
        operation: 'AND',
        children: [
          { operation: 'EQUALS', stringValue: '1' },
          {
            operation: 'OR',
            children: [
              { operation: 'EQUALS', stringValue: '2' },
              { operation: 'EQUALS', stringValue: '3' },
            ],
          },
        ],
      };
      // AND + leaf + OR + 2 leaves = 5
      expect(countNodes(tree)).toBe(5);
    });
    it('returns 0 for null and 1 for a lone leaf', () => {
      expect(countNodes(null)).toBe(0);
      expect(countNodes({ operation: 'EQUALS', stringValue: 'x' })).toBe(1);
    });
  });

  describe('buildLeafNode', () => {
    it('builds a single-value leaf with default IDENTITY key type', () => {
      expect(buildLeafNode('attribute.dept', 'EQUALS', ['sales'])).toEqual({
        operation: 'EQUALS',
        key: { type: 'IDENTITY', property: 'attribute.dept' },
        stringValue: 'sales',
      });
    });
    it('builds a multi-value leaf and honors a custom key type', () => {
      expect(
        buildLeafNode('memberOf', 'CONTAINS', ['x', 'y'], 'ACCOUNT')
      ).toEqual({
        operation: 'CONTAINS',
        key: { type: 'ACCOUNT', property: 'memberOf' },
        values: ['x', 'y'],
      });
    });
  });
});
