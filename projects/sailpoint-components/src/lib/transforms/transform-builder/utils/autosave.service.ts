// auto-save.service.ts
import { Injectable } from '@angular/core';
import { cloneDeep, isEqual } from 'lodash-es';
import { BehaviorSubject } from 'rxjs';

export interface SavedTransform {
  id?: string;
  name: string;
  definition: any;
  lastModified: number;
  isNew: boolean;
  cloudVersion?: any; // Store the original cloud version for comparison
}

@Injectable({
  providedIn: 'root',
})
export class AutoSaveService {
  private readonly STORAGE_KEY = 'sailpoint_transforms_autosave';
  private readonly UNSAVED_CHANGES_KEY = 'sailpoint_transforms_unsaved';

  private unsavedChangesSubject = new BehaviorSubject<Set<string>>(new Set());
  public unsavedChanges$ = this.unsavedChangesSubject.asObservable();

  constructor() {
    this.loadUnsavedChanges();
  }

  /**
   * Auto-save a transform locally
   */
  autoSave(
    transformId: string,
    name: string,
    definition: any,
    isNew: boolean = false,
    cloudVersion?: any
  ): void {
    const savedTransform: SavedTransform = {
      id: isNew ? undefined : transformId,
      name,
      definition,
      lastModified: Date.now(),
      isNew,
      cloudVersion,
    };

    const key = this.getStorageKey(transformId, isNew);
    localStorage.setItem(key, JSON.stringify(savedTransform));

    // Mark as having unsaved changes
    this.markAsUnsaved(transformId);

    console.log(`Auto-saved transform: ${name}`);
  }

  /**
   * Get locally saved transform
   */
  getLocalSave(
    transformId: string,
    isNew: boolean = false
  ): SavedTransform | null {
    const key = this.getStorageKey(transformId, isNew);
    const saved = localStorage.getItem(key);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved) as SavedTransform;
    } catch (error) {
      console.error('Failed to parse saved transform:', error);
      return null;
    }
  }

  /**
   * Clear local save after successful cloud sync
   */
  clearLocalSave(transformId: string): void {
    // const key = this.getStorageKey(transformId, isNew);
    // localStorage.removeItem(key);

    // Remove from unsaved changes
    this.markAsSaved(transformId);

  }

  /**
   * Get all locally saved transforms
   */
  getAllLocalSaves(): SavedTransform[] {
    const saves: SavedTransform[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY)) {
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            saves.push(JSON.parse(saved) as SavedTransform);
          } catch (error) {
            console.error('Failed to parse saved transform:', error);
          }
        }
      }
    }

    return saves.sort((a, b) => b.lastModified - a.lastModified);
  }

  /**
   * Check if transform has local changes
   */
  hasLocalChanges(transformId: string): boolean {
    return this.unsavedChangesSubject.value.has(transformId);
  }

  /**
   * Check if transform definition differs from cloud version
   */
  hasUnsavedChanges(transformId: string, currentDefinition: any): boolean {
    const localSave = this.getLocalSave(transformId);
    if (!localSave) {
      console.warn('[AutoSave] ✖ no local save for:', transformId);
      return false;
    }

    // 1) compare the flag against the _last‑saved_ definition
    const savedDef = localSave.definition;
    const savedFlag = !!savedDef.attributes?.requiresPeriodicRefresh;
    const currentFlag = !!currentDefinition.attributes?.requiresPeriodicRefresh;
    if (savedFlag !== currentFlag) {
      return true;
    }

    // 2) deep‑compare the rest
    const normalizedSaved = this.normalizeDefinition(savedDef);
    const normalizedCurrent = this.normalizeDefinition(currentDefinition);


    const isDifferent = !isEqual(normalizedSaved, normalizedCurrent);
    return isDifferent;
  }

  private normalizeDefinition(def: any): any {
    const clone = cloneDeep(def);

    if (typeof clone !== 'object' || clone === null) {
      return clone;
    }

    // — normalize requiresPeriodicRefresh into a boolean (default false) —
    if (clone.attributes && typeof clone.attributes === 'object') {
      const raw = (clone.attributes as Record<string, any>)
        .requiresPeriodicRefresh;
      (clone.attributes as Record<string, any>).requiresPeriodicRefresh =
        raw === true || raw === 'true';
    }

    // Remove irrelevant top-level fields
    delete clone.id;

    // Normalize top-level name (Static (X) → X, Concatenate (X) → X)
    if (typeof clone.name === 'string') {
      const match = clone.name.match(/^(Static|Concatenate) \((.+)\)$/);
      if (match) {
        clone.name = match[2].trim();
      }
    }

    // Normalize or remove internal
    if (
      'internal' in clone &&
      (clone.internal === false || clone.internal === undefined)
    ) {
      delete clone.internal;
    }

    // Recursively clean nested "name" fields
    function deepCleanNames(obj: any): void {
      if (Array.isArray(obj)) {
        obj.forEach(deepCleanNames);
      } else if (typeof obj === 'object' && obj !== null) {
        delete obj.name;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-argument
        Object.entries(obj).forEach(([_unusedKey, val]) => deepCleanNames(val));
      }
    }

    // Apply deep clean to attributes
    if (typeof clone.attributes === 'object' && clone.attributes !== null) {
      deepCleanNames(clone.attributes);
    }

    return clone;
  }

  /**
   * Get time since last auto-save
   */
  getTimeSinceLastSave(
    transformId: string,
    isNew: boolean = false
  ): string | null {
    const localSave = this.getLocalSave(transformId, isNew);
    if (!localSave) {
      return null;
    }

    const timeDiff = Date.now() - localSave.lastModified;
    const minutes = Math.floor(timeDiff / 60000);
    const seconds = Math.floor((timeDiff % 60000) / 1000);

    if (minutes > 0) {
      return `${minutes}m ago`;
    } else {
      return `${seconds}s ago`;
    }
  }

  private getStorageKey(transformId: string, isNew: boolean): string {
    if (isNew) {
      return `${this.STORAGE_KEY}_new_${Date.now()}`;
    }
    return `${this.STORAGE_KEY}_${transformId}`;
  }

  private markAsUnsaved(transformId: string): void {
    const current = this.unsavedChangesSubject.value;
    const updated = new Set(current);
    updated.add(transformId);
    this.unsavedChangesSubject.next(updated);
    this.saveUnsavedChanges(updated);
  }

  private markAsSaved(transformId: string): void {
    const current = this.unsavedChangesSubject.value;
    const updated = new Set(current);
    updated.delete(transformId);
    this.unsavedChangesSubject.next(updated);
    this.saveUnsavedChanges(updated);
  }

  private saveUnsavedChanges(changes: Set<string>): void {
    localStorage.setItem(
      this.UNSAVED_CHANGES_KEY,
      JSON.stringify(Array.from(changes))
    );
  }

  private loadUnsavedChanges(): void {
    const saved = localStorage.getItem(this.UNSAVED_CHANGES_KEY);
    if (saved) {
      try {
        const changes = JSON.parse(saved) as string[];
        this.unsavedChangesSubject.next(new Set(changes));
      } catch (error) {
        console.error('Failed to load unsaved changes:', error);
      }
    }
  }

  /**
   * Clear all local saves (useful for cleanup)
   */
  clearAllLocalSaves(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(this.UNSAVED_CHANGES_KEY);

    this.unsavedChangesSubject.next(new Set());

  }
}
