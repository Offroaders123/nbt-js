/**
 * A mapping from type names to NBT type numbers.
 * {@link Writer} and {@link Reader}
 * have correspoding methods (e.g. {@link Writer.prototype.int})
 * for every type.
*/
export declare const tagTypes: {
    readonly end: 0;
    readonly byte: 1;
    readonly short: 2;
    readonly int: 3;
    readonly long: 4;
    readonly float: 5;
    readonly double: 6;
    readonly byteArray: 7;
    readonly string: 8;
    readonly list: 9;
    readonly compound: 10;
    readonly intArray: 11;
    readonly longArray: 12;
};
export type tagTypes = typeof tagTypes[keyof typeof tagTypes];
/**
 * A mapping from NBT type numbers to type names.
*/
export declare const tagTypeNames: {
    0: "end";
    1: "byte";
    2: "short";
    3: "int";
    4: "long";
    5: "float";
    6: "double";
    7: "byteArray";
    8: "string";
    9: "list";
    10: "compound";
    11: "intArray";
    12: "longArray";
};
export type tagTypeNames = typeof tagTypeNames[keyof typeof tagTypeNames];
/**
 * In addition to the named writing methods documented below,
 * the same methods are indexed by the NBT type number as well,
 * as shown in the example below.
 *
 * @see {@link Reader}
 *
 * @example
 * var writer = new Writer();
 *
 * // all equivalent
 * writer.int(42);
 * writer[3](42);
 * writer(tagTypes.int)(42);
 *
 * // overwrite the second int
 * writer.offset = 0;
 * writer.int(999);
 *
 * return writer.buffer;
*/
export declare class Writer {
    /**
     * Will be resized (x2) on write if necessary.
    */
    private buffer;
    /**
     * This is recreated when the buffer is.
    */
    private dataView;
    /**
     * This is recreated when the buffer is.
    */
    private arrayView;
    /**
     * The location in the buffer where bytes are written or read.
     * This increases after every write, but can be freely changed.
     * The buffer will be resized when necessary.
    */
    private offset;
    /**
     * Ensures that the buffer is large enough to write `size` bytes
     * at the current `this.offset`.
    */
    private accommodate;
    private write;
    /**
     * Returns the writen data as a slice from the internal buffer,
     * cutting off any padding at the end.
     *
     * @returns a [0, offset] slice of the interal buffer
    */
    getData(): ArrayBuffer;
    /**
     * @param value a signed byte
    */
    byte(value: number): this;
    [tagTypes.byte]: typeof this.byte;
    /**
     * @param value an unsigned byte
    */
    ubyte(value: number): this;
    /**
     * @param value a signed 16-bit integer
    */
    short(value: number): this;
    [tagTypes.short]: typeof this.short;
    /**
     * @param value a signed 32-bit integer
    */
    int(value: number): this;
    [tagTypes.int]: typeof this.int;
    /**
     * @param value a signed 32-bit float
    */
    float(value: number): this;
    [tagTypes.float]: typeof this.float;
    /**
     * @param value a signed 64-bit float
    */
    double(value: number): this;
    [tagTypes.double]: typeof this.double;
    /**
     * As JavaScript does not support 64-bit integers natively, this
     * method takes an array of two 32-bit integers that make up the
     * upper and lower halves of the long.
     *
     * @param value [upper, lower]
    */
    long(value: [number, number]): this;
    [tagTypes.long]: typeof this.long;
    byteArray(value: Uint8Array): this;
    [tagTypes.byteArray]: typeof this.byteArray;
    intArray(value: number[]): this;
    [tagTypes.intArray]: typeof this.intArray;
    longArray(value: [number, number][]): this;
    [tagTypes.longArray]: typeof this.longArray;
    string(value: string): this;
    [tagTypes.string]: typeof this.string;
    /**
     * @param value.type the NBT type number
     * @param value.value an array of values
    */
    list(value: {
        type: number;
        value: Array<any>;
    }): this;
    [tagTypes.list]: typeof this.list;
    /**
     * @param value a key/value map
     * @param value.KEY.type the NBT type number
     * @param value.KEY.value a value matching the type
     *
     * @example
     * writer.compound({
     *     foo: { type: 'int', value: 12 },
     *     bar: { type: 'string', value: 'Hello, World!' }
     * });
    */
    compound(value: {
        KEY: {
            type: string;
            value: object;
        };
    }): this;
    [tagTypes.compound]: typeof this.compound;
}
/**
 * In addition to the named writing methods documented below,
 * the same methods are indexed by the NBT type number as well,
 * as shown in the example below.
 *
 * @see {@link Writer}
 *
 * @example
 * var reader = new Reader(buf);
 * int x = reader.int();
 * int y = reader[3]();
 * int z = reader[tagTypes.int]();
*/
export declare class Reader {
    private buffer;
    private arrayView;
    private dataView;
    constructor(buffer: ArrayBuffer | Uint8Array);
    /**
     * The current location in the buffer. Can be freely changed
     * within the bounds of the buffer.
    */
    private offset;
    private read;
    /**
     * @returns the read byte
    */
    byte(): number;
    [tagTypes.byte]: typeof this.byte;
    /**
     * @returns the read unsigned byte
    */
    ubyte(): number;
    /**
     * @returns the read signed 16-bit short
    */
    short(): number;
    [tagTypes.short]: typeof this.short;
    /**
     * @returns the read signed 32-bit integer
    */
    int(): number;
    [tagTypes.int]: typeof this.int;
    /**
     * @returns the read signed 32-bit float
    */
    float(): number;
    [tagTypes.float]: typeof this.float;
    /**
     * @returns the read signed 64-bit float
    */
    double(): number;
    [tagTypes.double]: typeof this.double;
    /**
     * As JavaScript does not not natively support 64-bit
     * integers, the value is returned as an array of two
     * 32-bit integers, the upper and the lower.
     *
     * @returns [upper, lower]
    */
    long(): [number, number];
    [tagTypes.long]: typeof this.long;
    /**
     * @returns the read array
    */
    byteArray(): number[];
    [tagTypes.byteArray]: typeof this.byteArray;
    /**
     * @returns the read array of 32-bit ints
    */
    intArray(): number[];
    [tagTypes.intArray]: typeof this.intArray;
    /**
     * As JavaScript does not not natively support 64-bit
     * integers, the value is returned as an array of arrays of two
     * 32-bit integers, the upper and the lower.
     *
     * @returns the read array of 64-bit ints
     *     split into [upper, lower]
    */
    longArray(): [number, number][];
    [tagTypes.longArray]: typeof this.longArray;
    /**
     * @returns the read string
    */
    string(): string;
    [tagTypes.string]: typeof this.string;
    /**
     * @example
     * reader.list();
     * // -> { type: 'string', values: ['foo', 'bar'] }
    */
    list(): {
        type: string;
        value: any[];
    };
    [tagTypes.list]: typeof this.list;
    /**
     * @example
     * reader.compound();
     * // -> { foo: { type: int, value: 42 },
     * //      bar: { type: string, value: 'Hello! }}
    */
    compound(): {
        [s: string]: {
            type: string;
            value: any;
        };
    };
    [tagTypes.compound]: typeof this.compound;
}
/**
 * @param value a named compound
 * @param value.name the top-level name
 * @param value.value a compound
 *
 * @see {@link parseUncompressed}
 * @see {@link Writer.prototype.compound}
 *
 * @example
 * writeUncompressed({
 *     name: 'My Level',
 *     value: {
 *         foo: { type: int, value: 42 },
 *         bar: { type: string, value: 'Hi!' }
 *     }
 * });
*/
export declare function writeUncompressed(value: {
    name: string;
    value: object;
}): ArrayBuffer;
/**
 * @param data an uncompressed NBT archive
 * @returns a named compound
 *
 * @see {@link parse}
 * @see {@link writeUncompressed}
 *
 * @example
 * readUncompressed(buf);
 * // -> { name: 'My Level',
 * //      value: { foo: { type: int, value: 42 },
 * //               bar: { type: string, value: 'Hi!' }}}
*/
export declare function parseUncompressed(data: ArrayBuffer | Uint8Array): {
    name: string;
    value: {
        [s: string]: Object;
    };
};
/**
 * @param result a named compound
 * @param result.name the top-level name
 * @param result.value the top-level compound
*/
type parseCallback = (error?: object | null, result?: {
    name: string;
    value: any;
} | null) => void;
/**
 * This accepts both gzipped and uncompressd NBT archives.
 * If the archive is uncompressed, the callback will be
 * called directly from this method. For gzipped files, the
 * callback is async.
 *
 * For use in the browser, window.zlib must be defined to decode
 * compressed archives. It will be passed a Buffer if the type is
 * available, or an Uint8Array otherwise.
 *
 * @param data gzipped or uncompressed data
 *
 * @see {@link parseUncompressed}
 * @see {@link Reader.prototype.compound}
 *
 * @example
 * parse(buf, function(error, results) {
 *     if (error) {
 *         throw error;
 *     }
 *     console.log(result.name);
 *     console.log(result.value.foo);
 * });
*/
export declare function parse(data: ArrayBuffer | Uint8Array, callback: parseCallback): void;
export {};
