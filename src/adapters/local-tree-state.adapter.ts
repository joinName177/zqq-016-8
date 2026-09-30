import { CounterfactualTree } from '../core/models';

const TREE_STORAGE_KEY = 'parallel_life_tree_v1';

export type WaterRequestStatus = 'pending' | 'failed';

export interface WaterRequest {
  id: string;
  treeId: string;
  nodeId: string;
  status: WaterRequestStatus;
  createdAt: number;
}

interface PersistedTreeState {
  tree: CounterfactualTree;
  waterRequests: WaterRequest[];
}

export class LocalTreeStateAdapter {
  private memoryState: PersistedTreeState | null = null;
  private storageAvailable: boolean | null = null;

  getTree(): CounterfactualTree | null {
    return this.getState()?.tree ?? null;
  }

  saveTree(tree: CounterfactualTree, completedWaterRequestId?: string): void {
    const state = this.getState();
    const waterRequests =
      state?.tree.id === tree.id
        ? state.waterRequests.filter(request => request.id !== completedWaterRequestId)
        : [];
    this.setState({ tree, waterRequests });
  }

  getWaterRequests(treeId: string): WaterRequest[] {
    return this.getState()?.waterRequests.filter(request => request.treeId === treeId) ?? [];
  }

  saveWaterRequest(request: WaterRequest): void {
    const state = this.getState();
    if (!state || state.tree.id !== request.treeId) return;

    const requests = state.waterRequests.filter(item => item.id !== request.id);
    requests.push(request);
    this.setState({ ...state, waterRequests: requests });
  }

  removeWaterRequest(requestId: string): void {
    const state = this.getState();
    if (!state) return;

    this.setState({
      ...state,
      waterRequests: state.waterRequests.filter(request => request.id !== requestId)
    });
  }

  private getState(): PersistedTreeState | null {
    if (this.memoryState) return this.memoryState;

    try {
      const raw = localStorage.getItem(TREE_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<PersistedTreeState>;
      if (!this.isTree(parsed.tree) || !Array.isArray(parsed.waterRequests)) {
        return null;
      }

      this.memoryState = {
        tree: parsed.tree,
        waterRequests: parsed.waterRequests.filter(this.isWaterRequest)
      };
      return this.memoryState;
    } catch {
      return null;
    }
  }

  private setState(state: PersistedTreeState): void {
    if (this.isStorageAvailable()) {
      localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(state));
    }

    this.memoryState = state;
  }

  private isStorageAvailable(): boolean {
    if (this.storageAvailable !== null) return this.storageAvailable;

    try {
      const probeKey = `${TREE_STORAGE_KEY}_probe`;
      localStorage.setItem(probeKey, '1');
      localStorage.removeItem(probeKey);
      this.storageAvailable = true;
    } catch {
      this.storageAvailable = false;
    }

    return this.storageAvailable;
  }

  private isTree(value: unknown): value is CounterfactualTree {
    if (typeof value !== 'object' || value === null) return false;
    const tree = value as Partial<CounterfactualTree>;
    return (
      typeof tree.id === 'string' &&
      typeof tree.assumption === 'string' &&
      typeof tree.rootId === 'string' &&
      typeof tree.nodes === 'object' &&
      tree.nodes !== null &&
      Array.isArray(tree.specimens)
    );
  }

  private isWaterRequest(value: unknown): value is WaterRequest {
    if (typeof value !== 'object' || value === null) return false;
    const request = value as Partial<WaterRequest>;
    return (
      typeof request.id === 'string' &&
      typeof request.treeId === 'string' &&
      typeof request.nodeId === 'string' &&
      (request.status === 'pending' || request.status === 'failed') &&
      typeof request.createdAt === 'number'
    );
  }
}
