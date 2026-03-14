/**
 * 值对象标记基类
 *
 * 值对象不可变，通过属性值判等。
 * 子类应使用 readonly 字段确保不可变性。
 */
export abstract class ValueObject {
  abstract equals(other: ValueObject): boolean;
}
