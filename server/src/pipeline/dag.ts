import type { Task } from './task.js';

export class DAG {
  private readonly tasksByName = new Map<string, Task>();

  constructor(tasks: readonly Task[] = []) {
    for (const task of tasks) this.register(task);
  }

  get tasks(): readonly Task[] {
    return [...this.tasksByName.values()];
  }

  register(task: Task): void {
    if (this.tasksByName.has(task.name)) {
      throw new Error(`Duplicate task name: ${task.name}`);
    }
    this.tasksByName.set(task.name, task);
  }

  getTask(name: string): Task {
    const task = this.tasksByName.get(name);
    if (!task) throw new Error(`Unknown task: ${name}`);
    return task;
  }

  getDependencies(name: string): readonly string[] {
    return this.getTask(name).dependencies;
  }

  validate(): void {
    for (const task of this.tasksByName.values()) {
      for (const dependency of task.dependencies) {
        if (!this.tasksByName.has(dependency)) {
          throw new Error(`Task "${task.name}" references missing dependency "${dependency}"`);
        }
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (task: Task): void => {
      if (visiting.has(task.name)) {
        throw new Error(`Circular dependency detected at task "${task.name}"`);
      }
      if (visited.has(task.name)) return;

      visiting.add(task.name);
      for (const dependency of task.dependencies) {
        visit(this.getTask(dependency));
      }
      visiting.delete(task.name);
      visited.add(task.name);
    };

    for (const task of this.tasksByName.values()) visit(task);
  }
}
