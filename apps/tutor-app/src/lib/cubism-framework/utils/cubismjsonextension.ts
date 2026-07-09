// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import {
  JsonArray,
  JsonBoolean,
  JsonFloat,
  JsonMap,
  JsonNullvalue,
  JsonString,
  Value
} from './cubismjson';

/**
 * 不采用 CubismJson 内置的 Json 解析器，
 * 而是使用 TypeScript 标准 Json 解析器等输出结果，
 * 并将其转换为 Cubism SDK 定义的 JSON 元素
 * 的处理类。
 */
export class CubismJsonExtension {
  static parseJsonObject(obj: Value, map: JsonMap) {
    Object.keys(obj).forEach(key => {
      if (typeof obj[key] == 'boolean') {
        const convValue = Boolean(obj[key]);
        map.put(key, new JsonBoolean(convValue));
      } else if (typeof obj[key] == 'string') {
        const convValue = String(obj[key]);
        map.put(key, new JsonString(convValue));
      } else if (typeof obj[key] == 'number') {
        const convValue = Number(obj[key]);
        map.put(key, new JsonFloat(convValue));
      } else if (obj[key] instanceof Array) {
        // HACK: 无法单独转换 Array，因此先改为 unknown 再转为 Value
        map.put(
          key,
          CubismJsonExtension.parseJsonArray(obj[key] as unknown as Value)
        );
      } else if (obj[key] instanceof Object) {
        map.put(
          key,
          CubismJsonExtension.parseJsonObject(obj[key], new JsonMap())
        );
      } else if (obj[key] == null) {
        map.put(key, new JsonNullvalue());
      } else {
        // 即使不匹配任何类型也进行处理
        map.put(key, obj[key]);
      }
    });
    return map;
  }

  protected static parseJsonArray(obj: Value) {
    const arr = new JsonArray();
    Object.keys(obj).forEach(key => {
      const convKey = Number(key);
      if (typeof convKey == 'number') {
        if (typeof obj[key] == 'boolean') {
          const convValue = Boolean(obj[key]);
          arr.add(new JsonBoolean(convValue));
        } else if (typeof obj[key] == 'string') {
          const convValue = String(obj[key]);
          arr.add(new JsonString(convValue));
        } else if (typeof obj[key] == 'number') {
          const convValue = Number(obj[key]);
          arr.add(new JsonFloat(convValue));
        } else if (obj[key] instanceof Array) {
          // HACK: 无法单独转换 Array，因此先改为 unknown 再转为 Value
          arr.add(this.parseJsonArray(obj[key] as unknown as Value));
        } else if (obj[key] instanceof Object) {
          arr.add(this.parseJsonObject(obj[key], new JsonMap()));
        } else if (obj[key] == null) {
          arr.add(new JsonNullvalue());
        } else {
          // 即使不匹配任何类型也进行处理
          arr.add(obj[key]);
        }
      } else if (obj[key] instanceof Array) {
        // HACK: 无法单独转换 Array，因此先改为 unknown 再转为 Value
        arr.add(this.parseJsonArray(obj[key] as unknown as Value));
      } else if (obj[key] instanceof Object) {
        arr.add(this.parseJsonObject(obj[key], new JsonMap()));
      } else if (obj[key] == null) {
        arr.add(new JsonNullvalue());
      } else {
        const convValue = Array(obj[key]);
        // 即使无法判定为数组或 Object 也进行处理
        for (let i = 0; i < convValue.length; i++) {
          arr.add(convValue[i]);
        }
      }
    });
    return arr;
  }
}
