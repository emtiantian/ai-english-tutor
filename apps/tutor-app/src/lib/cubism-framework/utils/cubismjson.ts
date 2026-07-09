// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { strtod } from '../live2dcubismframework';
import { CubismLogInfo } from './cubismdebug';

// 在 StaticInitializeNotForClientCall() 中初始化
const CSM_JSON_ERROR_TYPE_MISMATCH = 'Error: type mismatch';
const CSM_JSON_ERROR_INDEX_OF_BOUNDS = 'Error: index out of bounds';

/**
 * 解析后的 JSON 元素基类。
 */
export abstract class Value {
  /**
   * 构造函数
   */
  public constructor() {}

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public abstract getString(defaultValue?: string, indent?: string): string;

  /**
   * 以字符串形式返回元素（string）
   */
  public getRawString(defaultValue?: string, indent?: string): string {
    return this.getString(defaultValue, indent);
  }

  /**
   * 以数值形式返回元素（number）
   */
  public toInt(defaultValue = 0): number {
    return defaultValue;
  }

  /**
   * 以数值形式返回元素（number）
   */
  public toFloat(defaultValue = 0): number {
    return defaultValue;
  }

  /**
   * 以布尔值形式返回元素（boolean）
   */
  public toBoolean(defaultValue = false): boolean {
    return defaultValue;
  }

  /**
   * 返回大小
   */
  public getSize(): number {
    return 0;
  }

  /**
   * 以数组形式返回元素（Value[]）
   */
  public getArray(defaultValue: Value[] = null): Value[] {
    return defaultValue;
  }

  /**
   * 以容器形式返回元素（array）
   */
  public getVector(defaultValue = new Array<Value>()): Array<Value> {
    return defaultValue;
  }

  /**
   * 以 Map 形式返回元素（Map<String, Value>）
   */
  public getMap(defaultValue?: Map<string, Value>): Map<string, Value> {
    return defaultValue;
  }

  /**
   * 下标运算符 [index]
   */
  public getValueByIndex(index: number): Value {
    return Value.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }

  /**
   * 下标运算符 [string]
   */
  public getValueByString(s: string): Value {
    return Value.nullValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }

  /**
   * 以容器形式返回 Map 的键列表
   *
   * @return Map 的键列表
   */
  public getKeys(): Array<string> {
    return Value.dummyKeys;
  }

  /**
   * 若 Value 类型为错误值则返回 true
   */
  public isError(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为 null 则返回 true
   */
  public isNull(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为布尔值则返回 true
   */
  public isBool(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为数值型则返回 true
   */
  public isFloat(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为字符串则返回 true
   */
  public isString(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为数组则返回 true
   */
  public isArray(): boolean {
    return false;
  }

  /**
   * 若 Value 类型为 Map 型则返回 true
   */
  public isMap(): boolean {
    return false;
  }

  /**
   * 若与参数值相等则返回 true
   */
  public equals(value: string): boolean;
  public equals(value: string): boolean;
  public equals(value: number): boolean;
  public equals(value: boolean): boolean;
  public equals(value: any): boolean {
    return false;
  }

  /**
   * 若 Value 值为静态则返回 true，静态值不释放
   */
  public isStatic(): boolean {
    return false;
  }

  /**
   * 向 Value 设置错误值
   */
  public setErrorNotForClientCall(errorStr: string): Value {
    return JsonError.errorValue;
  }

  /**
   * 初始化方法
   */
  public static staticInitializeNotForClientCall(): void {
    JsonBoolean.trueValue = new JsonBoolean(true);
    JsonBoolean.falseValue = new JsonBoolean(false);
    Value.errorValue = new JsonError('ERROR', true);
    Value.nullValue = new JsonNullvalue();
    Value.dummyKeys = new Array<string>();
  }

  /**
   * 释放方法
   */
  public static staticReleaseNotForClientCall(): void {
    JsonBoolean.trueValue = null;
    JsonBoolean.falseValue = null;
    Value.errorValue = null;
    Value.nullValue = null;
    Value.dummyKeys = null;
  }

  protected _stringBuffer: string; // 字符串缓冲区

  private static dummyKeys: Array<string>; // 虚拟键

  public static errorValue: Value; // 作为临时返回值返回的错误。在 CubismFramework::Dispose 之前不要 delete
  public static nullValue: Value; // 作为临时返回值返回的 NULL。在 CubismFramework::Dispose 之前不要 delete

  [key: string]: any; // 显式将关联数组指定为 any 类型
}

/**
 * 仅支持 ASCII 字符的最小轻量 JSON 解析器。
 * 规格为 JSON 的子集。
 * 用于加载配置文件（model3.json）等。
 *
 * [未支持项]
 * · 日语等非 ASCII 字符
 * · e 表示的指数
 */
export class CubismJson {
  /**
   * 构造函数
   */
  public constructor(buffer?: ArrayBuffer, length?: number) {
    this._error = null;
    this._lineCount = 0;
    this._root = null;

    if (buffer != undefined) {
      this.parseBytes(buffer, length, this._parseCallback);
    }
  }

  /**
   * 直接从字节数据加载并解析
   *
   * @param buffer 缓冲区
   * @param size 缓冲区大小
   * @return CubismJson 类的实例。失败则返回 NULL
   */
  public static create(buffer: ArrayBuffer, size: number) {
    const json = new CubismJson();
    const succeeded: boolean = json.parseBytes(
      buffer,
      size,
      json._parseCallback
    );

    if (!succeeded) {
      CubismJson.delete(json);
      return null;
    } else {
      return json;
    }
  }

  /**
   * 释放解析后的 JSON 对象
   *
   * @param instance CubismJson 类的实例
   */
  public static delete(instance: CubismJson) {
    instance = null;
  }

  /**
   * 返回解析后的 JSON 根元素
   */
  public getRoot(): Value {
    return this._root;
  }

  /**
   * 将 Unicode 二进制转换为 String
   *
   * @param buffer 要转换的二进制数据
   * @return 转换后的字符串
   */
  public static arrayBufferToString(buffer: ArrayBuffer): string {
    const uint8Array: Uint8Array = new Uint8Array(buffer);
    let str = '';

    for (let i = 0, len: number = uint8Array.length; i < len; ++i) {
      str += '%' + this.pad(uint8Array[i].toString(16));
    }

    str = decodeURIComponent(str);
    return str;
  }

  /**
   * 编码、填充
   */
  private static pad(n: string): string {
    return n.length < 2 ? '0' + n : n;
  }

  /**
   * 执行 JSON 解析
   * @param buffer    要解析的数据字节
   * @param size      数据字节大小
   * return true : 成功
   * return false: 失败
   */
  public parseBytes(
    buffer: ArrayBuffer,
    size: number,
    parseCallback?: parseJsonObject
  ): boolean {
    const endPos: number[] = new Array<number>(1); // 为按引用传递使用数组
    const decodeBuffer: string = CubismJson.arrayBufferToString(buffer);

    if (parseCallback == undefined) {
      this._root = this.parseValue(decodeBuffer, size, 0, endPos);
    } else {
      // 使用 TypeScript 标准 JSON 解析器
      this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
    }

    if (this._error) {
      let strbuf = '\0';
      strbuf = 'Json parse error : @line ' + (this._lineCount + 1) + '\n';
      this._root = new JsonString(strbuf);

      CubismLogInfo('{0}', this._root.getRawString());
      return false;
    } else if (this._root == null) {
      this._root = new JsonError(this._error, false); // root 会被释放，因此单独创建错误对象
      return false;
    }
    return true;
  }

  /**
   * 返回解析时的错误值
   */
  public getParseError(): string {
    return this._error;
  }

  /**
   * 若根元素的下一个元素是文件结尾则返回 true
   */
  public checkEndOfFile(): boolean {
    return this._root.getArray()[1].equals('EOF');
  }

  /**
   * 从 JSON 元素解析 Value(float, String, Value*, Array, null, true, false)
   * 根据元素格式内部调用 ParseString()、ParseObject()、ParseArray()
   *
   * @param   buffer      JSON 元素的缓冲区
   * @param   length      要解析的长度
   * @param   begin       开始解析的位置
   * @param   outEndPos   解析结束时的位置
   * @return      从解析中获取的 Value 对象
   */
  protected parseValue(
    buffer: string,
    length: number,
    begin: number,
    outEndPos: number[]
  ) {
    if (this._error) return null;

    let o: Value = null;
    let i: number = begin;
    let f: number;

    for (; i < length; i++) {
      const c: string = buffer[i];
      switch (c) {
        case '-':
        case '.':
        case '0':
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7':
        case '8':
        case '9': {
          const afterString: string[] = new Array(1); // 为按引用传递
          f = strtod(buffer.slice(i), afterString);
          outEndPos[0] = buffer.indexOf(afterString[0]);
          return new JsonFloat(f);
        }
        case '"':
          return new JsonString(
            this.parseString(buffer, length, i + 1, outEndPos)
          ); // 从 \" 的下一个字符开始
        case '[':
          o = this.parseArray(buffer, length, i + 1, outEndPos);
          return o;
        case '{':
          o = this.parseObject(buffer, length, i + 1, outEndPos);
          return o;
        case 'n': // 只可能是 null
          if (i + 3 < length) {
            o = new JsonNullvalue(); // 使其可以被释放
            outEndPos[0] = i + 4;
          } else {
            this._error = 'parse null';
          }
          return o;
        case 't': // 只可能是 true
          if (i + 3 < length) {
            o = JsonBoolean.trueValue;
            outEndPos[0] = i + 4;
          } else {
            this._error = 'parse true';
          }
          return o;
        case 'f': // 只可能是 false
          if (i + 4 < length) {
            o = JsonBoolean.falseValue;
            outEndPos[0] = i + 5;
          } else {
            this._error = "illegal ',' position";
          }
          return o;
        case ',': // 数组分隔符
          this._error = "illegal ',' position";
          return null;
        case ']': // 虽然是非法的 }，但跳过。推测数组末尾有多余的 ,
          outEndPos[0] = i; // 重新处理同一字符
          return null;
        case '\n':
          this._lineCount++;
        // 继续进入下一个 case
        case ' ':
        case '\t':
        case '\r':
        default:
          // 跳过
          break;
      }
    }

    this._error = 'illegal end of value';
    return null;
  }

  /**
   * 解析到下一个「\"」为止的字符串。
   *
   * @param   string  ->  要解析的字符串
   * @param   length  ->  要解析的长度
   * @param   begin   ->  开始解析的位置
   * @param  outEndPos   ->  解析结束时的位置
   * @return      解析后的字符串元素
   */
  protected parseString(
    string: string,
    length: number,
    begin: number,
    outEndPos: number[]
  ): string {
    if (this._error) {
      return null;
    }

    if (!string) {
      this._error = 'string is null';
      return null;
    }

    let i = begin;
    let c: string, c2: string;
    let ret: string = '';
    let bufStart: number = begin; // 未写入 sbuf 的字符的起始位置

    for (; i < length; i++) {
      c = string[i];

      switch (c) {
        case '"': {
          // 这是结束引号，转义字符会另外处理，所以不会进入这里
          outEndPos[0] = i + 1; // \" 的下一个字符
          ret += string.substr(bufStart, i - bufStart); // 将之前的字符注册进去
          return ret;
        }
        // 继续进入下一个 case
        case '//': {
          // 转义的情况
          i++; // 将两个字符作为一组处理

          if (i - 1 > bufStart) {
            ret += string.substr(bufStart, i - bufStart); // 将之前的字符注册进去
          }
          bufStart = i + 1; // 从转义（两个字符）的下一个字符开始

          if (i < length) {
            c2 = string[i];

            switch (c2) {
              case '\\':
                ret += '\\';
                break;
              case '"':
                ret += '"';
                break;
              case '/':
                ret += '/';
                break;
              case 'b':
                ret += '\b';
                break;
              case 'f':
                ret += '\f';
                break;
              case 'n':
                ret += '\n';
                break;
              case 'r':
                ret += '\r';
                break;
              case 't':
                ret += '\t';
                break;
              case 'u':
                this._error = 'parse string/unicord escape not supported';
                break;
              default:
                break;
            }
          } else {
            this._error = 'parse string/escape error';
          }
        }
        // 继续进入下一个 case
        default: {
          break;
        }
      }
    }

    this._error = 'parse string/illegal end';
    return null;
  }

  /**
   * 解析 JSON 对象元素并返回 Value 对象
   *
   * @param buffer    JSON 元素的缓冲区
   * @param length    要解析的长度
   * @param begin     开始解析的位置
   * @param outEndPos 解析结束时的位置
   * @return 从解析中获取的 Value 对象
   */
  protected parseObject(
    buffer: string,
    length: number,
    begin: number,
    outEndPos: number[]
  ): Value {
    if (this._error) {
      return null;
    }

    if (!buffer) {
      this._error = 'buffer is null';
      return null;
    }

    const ret: JsonMap = new JsonMap();

    // 键：值
    let key = '';
    let i: number = begin;
    let c = '';
    const localRetEndPos2: number[] = Array(1);
    let ok = false;

    // 只要还有 , 就继续循环
    for (; i < length; i++) {
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];

        switch (c) {
          case '"':
            key = this.parseString(buffer, length, i + 1, localRetEndPos2);
            if (this._error) {
              return null;
            }

            i = localRetEndPos2[0];
            ok = true;
            break FOR_LOOP; // 跳出循环
          case '}': // 闭括号
            outEndPos[0] = i + 1;
            return ret; // 为空
          case ':':
            this._error = "illegal ':' position";
            break;
          case '\n':
            this._lineCount++;
          // 继续进入下一个 case
          default:
            break; // 要跳过的字符
        }
      }
      if (!ok) {
        this._error = 'key not found';
        return null;
      }

      ok = false;

      // 检查 :
      FOR_LOOP2: for (; i < length; i++) {
        c = buffer[i];

        switch (c) {
          case ':':
            ok = true;
            i++;
            break FOR_LOOP2;
          case '}':
            this._error = "illegal '}' position";
            break;
          // 继续进入下一个 case
          case '\n':
            this._lineCount++;
          // case ' ': case '\t' : case '\r':
          // 继续进入下一个 case
          default:
            break; // 要跳过的字符
        }
      }

      if (!ok) {
        this._error = "':' not found";
        return null;
      }

      // 检查值
      const value: Value = this.parseValue(buffer, length, i, localRetEndPos2);
      if (this._error) {
        return null;
      }

      i = localRetEndPos2[0];

      // ret.put(key, value);
      ret.put(key, value);

      FOR_LOOP3: for (; i < length; i++) {
        c = buffer[i];

        switch (c) {
          case ',':
            break FOR_LOOP3;
          case '}':
            outEndPos[0] = i + 1;
            return ret; // 正常结束
          case '\n':
            this._lineCount++;
          // 继续进入下一个 case
          default:
            break; // 跳过
        }
      }
    }

    this._error = 'illegal end of perseObject';
    return null;
  }

  /**
   * 解析到下一个「\"」为止的字符串。
   * @param buffer    JSON 元素的缓冲区
   * @param length    要解析的长度
   * @param begin     开始解析的位置
   * @param outEndPos 解析结束时的位置
   * @return 从解析中获取的 Value 对象
   */
  protected parseArray(
    buffer: string,
    length: number,
    begin: number,
    outEndPos: number[]
  ): Value {
    if (this._error) {
      return null;
    }

    if (!buffer) {
      this._error = 'buffer is null';
      return null;
    }

    let ret: JsonArray = new JsonArray();

    // 键 : 值
    let i: number = begin;
    let c: string;
    const localRetEndpos2: number[] = new Array(1);

    // 只要还有 , 就继续循环
    for (; i < length; i++) {
      // 检查 :
      const value: Value = this.parseValue(buffer, length, i, localRetEndpos2);

      if (this._error) {
        return null;
      }
      i = localRetEndpos2[0];

      if (value) {
        ret.add(value);
      }

      // FOR_LOOP3:
      // boolean breakflag = false;
      FOR_LOOP: for (; i < length; i++) {
        c = buffer[i];

        switch (c) {
          case ',':
            // breakflag = true;
            // break; // 次のKEY, VAlUEへ
            break FOR_LOOP;
          case ']':
            outEndPos[0] = i + 1;
            return ret; // 終了
          case '\n':
            ++this._lineCount;
          //case ' ': case '\t': case '\r':
          // 继续进入下一个 case
          default:
            break; // 跳过
        }
      }
    }

    ret = void 0;
    this._error = 'illegal end of parseObject';
    return null;
  }

  _parseCallback: parseJsonObject = CubismJsonExtension.parseJsonObject; // 解析时使用的处理回调函数

  _error: string; // 解析时的错误
  _lineCount: number; // 用于错误报告的行数计数
  _root: Value; // 解析后的根元素
}

interface parseJsonObject {
  (obj: Value, map: JsonMap): JsonMap;
}

/**
 * 将解析后的 JSON 元素作为 float 值处理
 */
export class JsonFloat extends Value {
  /**
   * 构造函数
   */
  constructor(v: number) {
    super();

    this._value = v;
  }

  /**
   * 若 Value 类型为数值型则返回 true
   */
  public isFloat(): boolean {
    return true;
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string): string {
    const strbuf = '\0';
    this._value = parseFloat(strbuf);
    this._stringBuffer = strbuf;

    return this._stringBuffer;
  }

  /**
   * 以数值形式返回元素（number）
   */
  public toInt(defaultValue = 0): number {
    return parseInt(this._value.toString());
  }

  /**
   * 以数值形式返回元素（number）
   */
  public toFloat(defaultValue = 0.0): number {
    return this._value;
  }

  /**
   * 若与参数值相等则返回 true
   */
  public equals(value: string): boolean;
  public equals(value: string): boolean;
  public equals(value: number): boolean;
  public equals(value: boolean): boolean;
  public equals(value: any): boolean {
    if ('number' === typeof value) {
      // 整数
      if (Math.round(value)) {
        return false;
      }
      // 浮点数
      else {
        return value == this._value;
      }
    }
    return false;
  }

  private _value: number; // JSON 元素的值
}

/**
 * 将解析后的 JSON 元素作为布尔值处理
 */
export class JsonBoolean extends Value {
  /**
   * 若 Value 类型为布尔值则返回 true
   */
  public isBool(): boolean {
    return true;
  }

  /**
   * 以布尔值形式返回元素（boolean）
   */
  public toBoolean(defaultValue = false): boolean {
    return this._boolValue;
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string): string {
    this._stringBuffer = this._boolValue ? 'true' : 'false';

    return this._stringBuffer;
  }

  /**
   * 若与参数值相等则返回 true
   */
  public equals(value: string): boolean;
  public equals(value: string): boolean;
  public equals(value: number): boolean;
  public equals(value: boolean): boolean;
  public equals(value: any): boolean {
    if ('boolean' === typeof value) {
      return value == this._boolValue;
    }
    return false;
  }

  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  public isStatic(): boolean {
    return true;
  }

  /**
   * 带参数的构造函数
   */
  public constructor(v: boolean) {
    super();

    this._boolValue = v;
  }

  static trueValue: JsonBoolean; // true
  static falseValue: JsonBoolean; // false

  private _boolValue: boolean; // JSON 元素的值
}

/**
 * 将解析后的 JSON 元素作为字符串处理
 */
export class JsonString extends Value {
  /**
   * 带参数的构造函数
   */
  public constructor(s: string) {
    super();
    this._stringBuffer = s;
  }

  /**
   * 若 Value 类型为字符串则返回 true
   */
  public isString(): boolean {
    return true;
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string): string {
    return this._stringBuffer;
  }

  /**
   * 若与参数值相等则返回 true
   */
  public equals(value: string): boolean;
  public equals(value: string): boolean;
  public equals(value: number): boolean;
  public equals(value: boolean): boolean;
  public equals(value: any): boolean {
    if ('string' === typeof value) {
      return this._stringBuffer == value;
    }

    return false;
  }
}

/**
 * JSON 解析时的错误结果。行为类似于字符串类型
 */
export class JsonError extends JsonString {
  /**
   * 若 Value 值为静态则返回 true，静态值不释放
   */
  public isStatic(): boolean {
    return this._isStatic;
  }

  /**
   * 设置错误信息
   */
  public setErrorNotForClientCall(s: string): Value {
    this._stringBuffer = s;
    return this;
  }

  /**
   * 带参数的构造函数
   */
  public constructor(s: string, isStatic: boolean) {
    if ('string' === typeof s) {
      super(s);
    } else {
      super(s);
    }
    this._isStatic = isStatic;
  }

  /**
   * 若 Value 类型为错误值则返回 true
   */
  public isError(): boolean {
    return true;
  }

  protected _isStatic: boolean; // 是否为静态 Value
}

/**
 * 将解析后的 JSON 元素作为 NULL 值持有
 */
export class JsonNullvalue extends Value {
  /**
   * 若 Value 类型为 NULL 值则返回 true
   */
  public isNull(): boolean {
    return true;
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string): string {
    return this._stringBuffer;
  }

  /**
   * Valueの値が静的ならtrue, 静的なら解放しない
   */
  public isStatic(): boolean {
    return true;
  }

  /**
   * 向 Value 设置错误值
   */
  public setErrorNotForClientCall(s: string): Value {
    this._stringBuffer = s;
    return JsonError.nullValue;
  }

  /**
   * 构造函数
   */
  public constructor() {
    super();

    this._stringBuffer = 'NullValue';
  }
}

/**
 * 将解析后的 JSON 元素作为数组持有
 */
export class JsonArray extends Value {
  /**
   * 构造函数
   */
  public constructor() {
    super();
    this._array = new Array<Value>();
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    for (let i = 0; i < this._array.length; i++) {
      let v: Value = this._array[i];
      if (v && !v.isStatic()) {
        v = void 0;
        v = null;
      }
    }
  }

  /**
   * 若 Value 类型为数组则返回 true
   */
  public isArray(): boolean {
    return true;
  }

  /**
   * 下标运算符 [index]
   */
  public getValueByIndex(index: number): Value {
    if (index < 0 || this._array.length <= index) {
      return Value.errorValue.setErrorNotForClientCall(
        CSM_JSON_ERROR_INDEX_OF_BOUNDS
      );
    }

    const v: Value = this._array[index];

    if (v == null) {
      return Value.nullValue;
    }

    return v;
  }

  /**
   * 下标运算符 [string]
   */
  public getValueByString(s: string): Value {
    return Value.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string): string {
    const stringBuffer: string = indent + '[\n';

    for (let i = 0; i < this._array.length; i++) {
      const v: Value = this._array[i];
      this._stringBuffer += indent + '' + v.getString(indent + ' ') + '\n';
    }

    this._stringBuffer = stringBuffer + indent + ']\n';

    return this._stringBuffer;
  }

  /**
   * 添加数组元素
   * @param v 要添加的元素
   */
  public add(v: Value): void {
    this._array.push(v);
  }

  /**
   * 以容器形式返回元素（Array<Value>）
   */
  public getVector(defaultValue: Array<Value> = null): Array<Value> {
    return this._array;
  }

  /**
   * 返回元素数量
   */
  public getSize(): number {
    return this._array.length;
  }

  private _array: Array<Value>; // JSON 元素的值
}

/**
 * 将解析后的 JSON 元素作为 Map 持有
 */
export class JsonMap extends Value {
  /**
   * 构造函数
   */
  public constructor() {
    super();
    this._map = new Map<string, Value>();
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    this._map.clear();
  }

  /**
   * 若 Value 值为 Map 型则返回 true
   */
  public isMap(): boolean {
    return true;
  }

  /**
   * 下标运算符 [string]
   */
  public getValueByString(s: string): Value {
    const ret = this._map.get(s);
    if (ret != undefined) {
      return ret;
    }
    return Value.nullValue;
  }

  /**
   * 下标运算符 [index]
   */
  public getValueByIndex(index: number): Value {
    return Value.errorValue.setErrorNotForClientCall(
      CSM_JSON_ERROR_TYPE_MISMATCH
    );
  }

  /**
   * 以字符串形式返回元素（string 类型）
   */
  public getString(defaultValue: string, indent: string) {
    this._stringBuffer = indent + '{\n';

    for (const element of this._map) {
      const key = element[0];
      const v: Value = element[1];

      this._stringBuffer +=
        indent + ' ' + key + ' : ' + v.getString(indent + '   ') + ' \n';
    }

    this._stringBuffer += indent + '}\n';

    return this._stringBuffer;
  }

  /**
   * 以 Map 型返回元素
   */
  public getMap(defaultValue?: Map<string, Value>): Map<string, Value> {
    return this._map;
  }

  /**
   * 向 Map 添加元素
   */
  public put(key: string, v: Value): void {
    this._map.set(key, v);
  }

  /**
   * 从 Map 获取键的列表
   */
  public getKeys(): Array<string> {
    if (!this._keys) {
      this._keys = [...this._map.keys()];
    }
    return this._keys;
  }

  /**
   * 获取 Map 的元素数量
   */
  public getSize(): number {
    return this._keys.length;
  }

  private _map: Map<string, Value>; // JSON 元素的值
  private _keys: Array<string>; // JSON 元素的值
}

// 为兼容性定义的命名空间。
import * as $ from './cubismjson';
import { CubismJsonExtension } from './cubismjsonextension';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismJson = $.CubismJson;
  export type CubismJson = $.CubismJson;
  export const JsonArray = $.JsonArray;
  export type JsonArray = $.JsonArray;
  export const JsonBoolean = $.JsonBoolean;
  export type JsonBoolean = $.JsonBoolean;
  export const JsonError = $.JsonError;
  export type JsonError = $.JsonError;
  export const JsonFloat = $.JsonFloat;
  export type JsonFloat = $.JsonFloat;
  export const JsonMap = $.JsonMap;
  export type JsonMap = $.JsonMap;
  export const JsonNullvalue = $.JsonNullvalue;
  export type JsonNullvalue = $.JsonNullvalue;
  export const JsonString = $.JsonString;
  export type JsonString = $.JsonString;
  export const Value = $.Value;
  export type Value = $.Value;
}
