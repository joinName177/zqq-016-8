import { CounterfactualTree, LifeSpecimen } from '../core/models';

export interface TreeEnginePort {
  createTree(assumption: string): CounterfactualTree;
  water(tree: CounterfactualTree, nodeId: string, opId?: string): CounterfactualTree;
  prune(tree: CounterfactualTree, nodeId: string): CounterfactualTree;
  harvest(tree: CounterfactualTree, nodeId: string): LifeSpecimen;
}
