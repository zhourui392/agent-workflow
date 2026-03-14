/**
 * 实体基类
 *
 * 提供身份标识和时间戳，所有聚合根和实体继承此类。
 * 实体通过 id 判等，而非属性值。
 */
export abstract class Entity {
  readonly id: string;
  readonly createdAt: string;
  protected _updatedAt: string;

  constructor(id: string, createdAt: string, updatedAt: string) {
    this.id = id;
    this.createdAt = createdAt;
    this._updatedAt = updatedAt;
  }

  get updatedAt(): string {
    return this._updatedAt;
  }

  equals(other: Entity): boolean {
    return this.id === other.id;
  }
}
