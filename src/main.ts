import './ui/styles.css';
import { TreeEngineAdapter } from './adapters/tree-engine.adapter';
import { LocalSpecimenAdapter } from './adapters/local-specimen.adapter';
import { CounterfactualTree } from './core/models';
import { renderTreeApp } from './ui/app';

const treeAdapter = new TreeEngineAdapter();
const specimenAdapter = new LocalSpecimenAdapter();

const PRESETS = [
  '如果当初我留在了故乡小城',
  '如果当初我鼓起勇气向TA表白了心意',
  '如果当年我选择了读纯艺术专业',
  '如果当年我没有接受那家大厂的Offer'
];

let currentTree: CounterfactualTree = treeAdapter.createTree(PRESETS[0]);
let isCabinetOpen = false;

// —— 浇水提交防重复状态（模块级，refreshView 重建 DOM 后依然保留）——
/** 正在处理中的浇水提交（按节点）。处理期间的重复点击直接忽略 */
const pendingWaterNodes = new Set<string>();
/** 每个节点最近一次被受理的浇水提交时间，用于冷却期去抖 */
const lastWaterAcceptedAt = new Map<string, number>();
/** 同一节点两次浇水提交的最小间隔（覆盖快速连点/双击） */
const WATER_SUBMIT_COOLDOWN_MS = 500;

const rootEl = document.getElementById('app')!;

function refreshView() {
  const specimens = specimenAdapter.getAll();

  renderTreeApp(
    rootEl,
    currentTree,
    specimens,
    isCabinetOpen,
    PRESETS,
    pendingWaterNodes,
    {
      onGrowNewTree: (assumption: string) => {
        currentTree = treeAdapter.createTree(assumption);
        refreshView();
      },
      onWaterNode: (nodeId: string) => {
        // 防重复① 快速连点：处理中或冷却期内的重复提交直接忽略。
        // 该状态存放在模块级而非 DOM 上，refreshView() 重建按钮后依然有效（防重复② 刷新）。
        if (pendingWaterNodes.has(nodeId)) return;
        const now = Date.now();
        if (now - (lastWaterAcceptedAt.get(nodeId) ?? 0) < WATER_SUBMIT_COOLDOWN_MS) return;

        pendingWaterNodes.add(nodeId);
        lastWaterAcceptedAt.set(nodeId, now);
        // 每次浇水意图生成唯一幂等键，引擎对相同键只生效一次
        const opId = `water-${nodeId}-${now}-${Math.random().toString(36).slice(2, 8)}`;
        try {
          currentTree = treeAdapter.water(currentTree, nodeId, opId);
        } catch {
          // 防重复③ 失败重试：复用同一幂等键重试一次，不会重复增加活力
          try {
            currentTree = treeAdapter.water(currentTree, nodeId, opId);
          } catch (err) {
            console.error('浇水提交失败：', err);
          }
        } finally {
          pendingWaterNodes.delete(nodeId);
          refreshView();
        }
      },
      onPruneNode: (nodeId: string) => {
        currentTree = treeAdapter.prune(currentTree, nodeId);
        refreshView();
      },
      onHarvestNode: (nodeId: string) => {
        const sp = treeAdapter.harvest(currentTree, nodeId);
        specimenAdapter.save(sp);
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

// Initial render
refreshView();
