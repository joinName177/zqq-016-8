import './ui/styles.css';
import { TreeEngineAdapter } from './adapters/tree-engine.adapter';
import { LocalSpecimenAdapter } from './adapters/local-specimen.adapter';
import {
  LocalTreeStateAdapter,
  WaterRequest
} from './adapters/local-tree-state.adapter';
import { CounterfactualTree } from './core/models';
import { renderTreeApp, WaterNodeState } from './ui/app';

const treeAdapter = new TreeEngineAdapter();
const specimenAdapter = new LocalSpecimenAdapter();
const treeStateAdapter = new LocalTreeStateAdapter();

const PRESETS = [
  '如果当初我留在了故乡小城',
  '如果当初我鼓起勇气向TA表白了心意',
  '如果当年我选择了读纯艺术专业',
  '如果当年我没有接受那家大厂的Offer'
];

let currentTree: CounterfactualTree =
  treeStateAdapter.getTree() ?? treeAdapter.createTree(PRESETS[0]);
let waterRequests: WaterRequest[] = treeStateAdapter.getWaterRequests(currentTree.id);
const activeWaterRequestIds = new Set<string>();
const activeWaterNodeIds = new Set<string>();
const lastWaterClickAt = new Map<string, number>();
const WATER_CLICK_GUARD_MS = 500;

const rootEl = document.getElementById('app')!;

function createWaterRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `water-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function persistWaterRequest(request: WaterRequest): void {
  treeStateAdapter.saveWaterRequest(request);
  waterRequests = treeStateAdapter.getWaterRequests(currentTree.id);
}

function syncWaterRequests(): void {
  waterRequests = treeStateAdapter.getWaterRequests(currentTree.id);
}

function markWaterRequestFailed(request: WaterRequest): void {
  const failedRequest: WaterRequest = { ...request, status: 'failed' };
  activeWaterRequestIds.delete(request.id);
  activeWaterNodeIds.delete(request.nodeId);
  persistWaterRequest(failedRequest);
}

function recoverPendingWaterRequests(): void {
  const pendingNodeIds = new Set<string>();

  waterRequests.filter(request => request.status === 'pending').forEach(request => {
    const node = currentTree.nodes[request.nodeId];
    const alreadyApplied = node?.appliedWaterRequestIds?.includes(request.id) ?? false;

    if (!node || node.isPruned) {
      treeStateAdapter.removeWaterRequest(request.id);
      return;
    }

    if (alreadyApplied) {
      treeStateAdapter.removeWaterRequest(request.id);
      pendingNodeIds.add(request.nodeId);
      return;
    }

    // Defensive guard: only one in-flight submission per node may be applied.
    if (pendingNodeIds.has(request.nodeId)) {
      markWaterRequestFailed(request);
      return;
    }

    try {
      const wateredTree = treeAdapter.water(currentTree, request.nodeId, request.id);
      treeStateAdapter.saveTree(wateredTree, request.id);
      currentTree = wateredTree;
      pendingNodeIds.add(request.nodeId);
    } catch {
      try {
        markWaterRequestFailed(request);
      } catch {
        // Keep the request pending; it can be recovered safely on the next reload.
      }
    }
  });

  syncWaterRequests();
}

function submitWater(nodeId: string, requestId?: string): void {
  const node = currentTree.nodes[nodeId];
  if (!node || node.isPruned) return;

  let request = waterRequests.find(item => item.id === requestId);

  if (request && (request.treeId !== currentTree.id || request.nodeId !== nodeId)) {
    request = undefined;
  }

  if (request) {
    if (request.status === 'pending' || activeWaterRequestIds.has(request.id)) return;
  } else {
    const pendingRequest = waterRequests.find(
      item => item.nodeId === nodeId && item.status === 'pending'
    );
    if (pendingRequest || activeWaterNodeIds.has(nodeId)) return;

    const lastClickAt = lastWaterClickAt.get(nodeId) ?? 0;
    if (Date.now() - lastClickAt < WATER_CLICK_GUARD_MS) return;

    request = {
      id: createWaterRequestId(),
      treeId: currentTree.id,
      nodeId,
      status: 'pending',
      createdAt: Date.now()
    };
  }

  const pendingRequest: WaterRequest = { ...request, status: 'pending' };
  activeWaterRequestIds.add(pendingRequest.id);
  activeWaterNodeIds.add(nodeId);
  lastWaterClickAt.set(nodeId, Date.now());
  try {
    persistWaterRequest(pendingRequest);
  } catch (persistError) {
    activeWaterRequestIds.delete(pendingRequest.id);
    activeWaterNodeIds.delete(nodeId);
    console.error('浇水请求创建失败，请稍后重试。', persistError);
    alert('浇水失败，请稍后重试。');
    return;
  }

  try {
    const wateredTree = treeAdapter.water(currentTree, nodeId, pendingRequest.id);
    try {
      treeStateAdapter.saveTree(wateredTree, pendingRequest.id);
    } catch (saveError) {
      try {
        markWaterRequestFailed(pendingRequest);
      } catch (markError) {
        console.error('浇水结果保存失败，且失败状态保存失败。', saveError, markError);
        refreshView();
        return;
      }
      console.error('浇水结果保存失败，可以安全重试。', saveError);
      alert('浇水失败，请点击“重试浇水”。');
      refreshView();
      return;
    }
    currentTree = wateredTree;
    activeWaterRequestIds.delete(pendingRequest.id);
    activeWaterNodeIds.delete(nodeId);
    syncWaterRequests();
  } catch (error) {
    try {
      markWaterRequestFailed(pendingRequest);
      console.error('浇水失败，可以使用相同请求安全重试。', error);
      alert('浇水失败，请点击“重试浇水”。');
    } catch (markError) {
      console.error('浇水失败，且失败状态保存失败，请刷新后恢复。', error, markError);
    }
  } finally {
    activeWaterRequestIds.delete(pendingRequest.id);
  }

  refreshView();
}

function getWaterNodeStates(): Record<string, WaterNodeState> {
  return waterRequests.reduce<Record<string, WaterNodeState>>((states, request) => {
    const node = currentTree.nodes[request.nodeId];
    if (node && !node.isPruned) {
      states[request.nodeId] = { requestId: request.id, status: request.status };
    }
    return states;
  }, {});
}

function refreshView() {
  const specimens = specimenAdapter.getAll();

  renderTreeApp(
    rootEl,
    currentTree,
    specimens,
    isCabinetOpen,
    PRESETS,
    getWaterNodeStates(),
    {
      onGrowNewTree: (assumption: string) => {
        currentTree = treeAdapter.createTree(assumption);
        treeStateAdapter.saveTree(currentTree);
        syncWaterRequests();
        refreshView();
      },
      onWaterNode: (nodeId: string, requestId?: string) => {
        submitWater(nodeId, requestId);
      },
      onPruneNode: (nodeId: string) => {
        currentTree = treeAdapter.prune(currentTree, nodeId);
        treeStateAdapter.saveTree(currentTree);
        syncWaterRequests();
        refreshView();
      },
      onHarvestNode: (nodeId: string) => {
        const sp = treeAdapter.harvest(currentTree, nodeId);
        specimenAdapter.save(sp);
        treeStateAdapter.saveTree(currentTree);
        alert(`已成功将节点【${sp.title}】收入平行人生标本馆！`);
        refreshView();
      },
      onDeleteSpecimen: (id: string) => {
        specimenAdapter.remove(id);
        refreshView();
      },
      onToggleCabinet: (open: boolean) => {
        isCabinetOpen = open;
        refreshView();
      }
    }
  );
}

let isCabinetOpen = false;

// Replay persisted, unfinished watering requests once before the first render.
recoverPendingWaterRequests();
treeStateAdapter.saveTree(currentTree);

// Initial render
refreshView();
