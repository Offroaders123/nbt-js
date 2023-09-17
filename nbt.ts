/*
	NBT.js - a JavaScript parser for NBT archives
	by Sijmen Mulder

	I, the copyright holder of this work, hereby release it into the public
	domain. This applies worldwide.

	In case this is not legally possible: I grant anyone the right to use this
	work for any purpose, without any conditions, unless such conditions are
	required by law.
*/

export namespace nbt {

	if (typeof ArrayBuffer === 'undefined') {
		throw new Error('Missing required type ArrayBuffer');
	}
	if (typeof DataView === 'undefined') {
		throw new Error('Missing required type DataView');
	}
	if (typeof Uint8Array === 'undefined') {
		throw new Error('Missing required type Uint8Array');
	}

	// /** @exports nbt */

	// var nbt = this;
	var zlib: typeof import("node:zlib") = typeof require !== 'undefined' ? require('zlib') : window.zlib;

	/**
	 * A mapping from type names to NBT type numbers.
	 * {@link nbt.Writer} and {@link nbt.Reader}
	 * have correspoding methods (e.g. {@link nbt.Writer.prototype.int})
	 * for every type.
	*/
	export const tagTypes = {
		'end': 0,
		'byte': 1,
		'short': 2,
		'int': 3,
		'long': 4,
		'float': 5,
		'double': 6,
		'byteArray': 7,
		'string': 8,
		'list': 9,
		'compound': 10,
		'intArray': 11,
		'longArray': 12
	} as const;

	export type tagTypes = typeof tagTypes;

	export type TagType = tagTypes[keyof tagTypes];

	/**
	 * A mapping from NBT type numbers to type names.
	*/
	export const tagTypeNames = {} as {
    [P in tagTypes[keyof tagTypes]]: {
        [K in keyof tagTypes]: tagTypes[K] extends P ? K : never;
    }[keyof tagTypes];
	};

	export type tagTypeNames = typeof tagTypeNames;

	export type TagTypeName = tagTypeNames[keyof tagTypeNames];

	(function() {
		for (var typeName in nbt.tagTypes) {
			if (nbt.tagTypes.hasOwnProperty(typeName)) {
				// @ts-expect-error - indexing
				nbt.tagTypeNames[nbt.tagTypes[typeName]] = typeName;
			}
		}
	})();

	function hasGzipHeader(data: ArrayBuffer | Uint8Array): boolean {
		var head = new Uint8Array(data.slice(0, 2));
		return head.length === 2 && head[0] === 0x1f && head[1] === 0x8b;
	}

	function encodeUTF8(str: string): number[] {
		var array: number[] = [], i, c;
		for (i = 0; i < str.length; i++) {
			c = str.charCodeAt(i);
			if (c < 0x80) {
				array.push(c);
			} else if (c < 0x800) {
				array.push(0xC0 | c >> 6);
				array.push(0x80 | c         & 0x3F);
			} else if (c < 0x10000) {
				array.push(0xE0 |  c >> 12);
				array.push(0x80 | (c >>  6) & 0x3F);
				array.push(0x80 |  c        & 0x3F);
			} else {
				array.push(0xF0 | (c >> 18) & 0x07);
				array.push(0x80 | (c >> 12) & 0x3F);
				array.push(0x80 | (c >>  6) & 0x3F);
				array.push(0x80 |  c        & 0x3F);
			}
		}
		return array;
	}

	function decodeUTF8(array: Uint8Array): string {
		var codepoints = [], i;
		for (i = 0; i < array.length; i++) {
			if ((array[i]! & 0x80) === 0) {
				codepoints.push(array[i]! & 0x7F);
			} else if (i+1 < array.length &&
						(array[i]!   & 0xE0) === 0xC0 &&
						(array[i+1]! & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]!   & 0x1F) << 6) |
					( array[i+1]! & 0x3F));
			} else if (i+2 < array.length &&
						(array[i]!   & 0xF0) === 0xE0 &&
						(array[i+1]! & 0xC0) === 0x80 &&
						(array[i+2]! & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]!   & 0x0F) << 12) |
					((array[i+1]! & 0x3F) <<  6) |
					( array[i+2]! & 0x3F));
			} else if (i+3 < array.length &&
						(array[i]!   & 0xF8) === 0xF0 &&
						(array[i+1]! & 0xC0) === 0x80 &&
						(array[i+2]! & 0xC0) === 0x80 &&
						(array[i+3]! & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]!   & 0x07) << 18) |
					((array[i+1]! & 0x3F) << 12) |
					((array[i+2]! & 0x3F) <<  6) |
					( array[i+3]! & 0x3F));
			}
		}
		return String.fromCharCode.apply(null, codepoints);
	}

	/** Not all environments, in particular PhantomJS, supply
	   Uint8Array.slice() */
	function sliceUint8Array(array: Uint8Array, begin?: number, end?: number): Uint8Array {
		if ('slice' in array) {
			return array.slice(begin, end);
		} else {
			return new Uint8Array([].slice.call(array, begin, end));
		}
	}

	export interface RootTag {
		name: string;
		value: CompoundTag["value"];
	}

	export type Tag = ByteTag | ShortTag | IntTag | LongTag | FloatTag | DoubleTag | ByteArrayTag | ListTag;

	export interface ByteTag {
		type: tagTypeNames[tagTypes["byte"]];
		value: number;
	}

	export interface ShortTag {
		type: tagTypeNames[tagTypes["short"]];
		value: number;
	}

	export interface IntTag {
		type: tagTypeNames[tagTypes["int"]];
		value: number;
	}

	export interface LongTag {
		type: tagTypeNames[tagTypes["long"]];
		value: [number,number];
	}

	export interface FloatTag {
		type: tagTypeNames[tagTypes["float"]];
		value: number;
	}

	export interface DoubleTag {
		type: tagTypeNames[tagTypes["double"]];
		value: number;
	}

	export interface ByteArrayTag {
		type: tagTypeNames[tagTypes["byteArray"]];
		value: number[];
	}

	export interface StringTag {
		type: tagTypeNames[tagTypes["string"]];
		value: string;
	}

	export interface ListTag<T extends Tag = Tag> {
		type: tagTypeNames[tagTypes["list"]];
		value: {
			type: T["type"],
			value: T["value"][]
		};
	}

	export interface CompoundTag {
		type: tagTypeNames[tagTypes["compound"]];
		value: {
			[name: string]: Tag;
		};
	}

	export interface IntArrayTag {
		type: tagTypeNames[tagTypes["intArray"]];
		value: number[];
	}

	export interface LongArrayTag {
		type: tagTypeNames[tagTypes["longArray"]];
		value: LongTag["value"][];
	}

	type WriterDataType = {
		[K in keyof DataView]: K extends `set${infer T}` ? T extends `Big${string}` ? never : T : never;
	}[keyof DataView];

	/**
	 * In addition to the named writing methods documented below,
	 * the same methods are indexed by the NBT type number as well,
	 * as shown in the example below.
	 *
	 * @see {@link nbt.Reader}
	 *
	 * @example
	 * var writer = new nbt.Writer();
	 *
	 * // all equivalent
	 * writer.int(42);
	 * writer[3](42);
	 * writer(nbt.tagTypes.int)(42);
	 *
	 * // overwrite the second int
	 * writer.offset = 0;
	 * writer.int(999);
	 *
	 * return writer.buffer; */
	export class Writer {
		/** Will be resized (x2) on write if necessary. */
		buffer: ArrayBuffer = new ArrayBuffer(1024);

		/** This is recreated when the buffer is */
		dataView: DataView = new DataView(this.buffer);
		/** This is recreated when the buffer is */
		arrayView: Uint8Array = new Uint8Array(this.buffer);

		/**
		 * The location in the buffer where bytes are written or read.
		 * This increases after every write, but can be freely changed.
		 * The buffer will be resized when necessary.  */
		offset: number = 0;

		/**
		 * Ensures that the buffer is large enough to write `size` bytes
		 * at the current `self.offset`. */
		private accommodate(size: number): void {
			var requiredLength = this.offset + size;
			if (this.buffer.byteLength >= requiredLength) {
				return;
			}

			var newLength = this.buffer.byteLength;
			while (newLength < requiredLength) {
				newLength *= 2;
			}

			var newBuffer = new ArrayBuffer(newLength);
			var newArrayView = new Uint8Array(newBuffer);
			newArrayView.set(this.arrayView);

			// If there's a gap between the end of the old buffer
			// and the start of the new one, we need to zero it out
			if (this.offset > this.buffer.byteLength) {
				newArrayView.fill(0, this.buffer.byteLength, this.offset);
			}

			this.buffer = newBuffer;
			this.dataView = new DataView(newBuffer);
			this.arrayView = newArrayView;
		}

		private write(dataType: WriterDataType, size: number, value: number): this {
			this.accommodate(size);
			this.dataView[`set${dataType}`](this.offset, value);
			this.offset += size;
			return this;
		}

		/**
		 * Returns the writen data as a slice from the internal buffer,
		 * cutting off any padding at the end.
		 *
		 * @returns a [0, offset] slice of the interal buffer */
		getData(): ArrayBuffer {
			this.accommodate(0);  /* make sure the offset is inside the buffer */
			return this.buffer.slice(0, this.offset);
		};

		/**
		 * @method module:nbt.Writer#byte
		 * @param {number} value - a signed byte
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.byte] = this.write.bind(this, 'Int8', 1);
		byte = this[tagTypes["byte"]];

		/**
		 * @method module:nbt.Writer#ubyte
		 * @param {number} value - an unsigned byte
		 * @returns {module:nbt.Writer} itself */
		ubyte = this.write.bind(this, 'Uint8', 1);

		/**
		 * @method module:nbt.Writer#short
		 * @param {number} value - a signed 16-bit integer
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.short] = this.write.bind(this, 'Int16', 2);
		short = this[tagTypes["short"]];

		/**
		 * @method module:nbt.Writer#int
		 * @param {number} value - a signed 32-bit integer
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.int] = this.write.bind(this, 'Int32', 4);
		int = this[tagTypes["int"]];

		/**
		 * @method module:nbt.Writer#float
		 * @param {number} value - a signed 32-bit float
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.float] = this.write.bind(this, 'Float32', 4);
		float = this[tagTypes["float"]];

		/**
		 * @method module:nbt.Writer#float
		 * @param {number} value - a signed 64-bit float
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.double] = this.write.bind(this, 'Float64', 8);
		double = this[tagTypes["float"]];

		/**
		 * As JavaScript does not support 64-bit integers natively, this
		 * method takes an array of two 32-bit integers that make up the
		 * upper and lower halves of the long.
		 *
		 * @method module:nbt.Writer#long
		 * @param {Array.<number>} value - [upper, lower]
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.long](value: LongTag["value"]): this {
			this.int(value[0]);
			this.int(value[1]);
			return this;
		};
		long = this[tagTypes["long"]];

		/**
		 * @method module:nbt.Writer#byteArray
		 * @param {Array.<number>|Uint8Array|Buffer} value
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.byteArray](value: ByteArrayTag["value"] | Uint8Array): this {
			this.int(value.length);
			this.accommodate(value.length);
			this.arrayView.set(value, this.offset);
			this.offset += value.length;
			return this;
		};
		byteArray = this[tagTypes["byteArray"]];

		/**
		 * @method module:nbt.Writer#intArray
		 * @param {Array.<number>} value
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.intArray](value: IntArrayTag["value"]): this {
			this.int(value.length);
			var i;
			for (i = 0; i < value.length; i++) {
				this.int(value[i]!);
			}
			return this;
		};
		intArray = this[tagTypes["intArray"]];

		/**
		 * @method module:nbt.Writer#longArray
		 * @param {Array.<number>} value
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.longArray](value: LongArrayTag["value"]): this {
			this.int(value.length);
			var i;
			for (i = 0; i < value.length; i++) {
				this.long(value[i]!);
			}
			return this;
		};
		longArray = this[tagTypes["longArray"]];

		/**
		 * @method module:nbt.Writer#string
		 * @param {string} value
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.string](value: StringTag["value"]): this {
			var bytes = encodeUTF8(value);
			this.short(bytes.length);
			this.accommodate(bytes.length);
			this.arrayView.set(bytes, this.offset);
			this.offset += bytes.length;
			return this;
		};
		string = this[tagTypes["string"]];

		/**
		 * @method module:nbt.Writer#list
		 * @param {Object} value
		 * @param {number} value.type - the NBT type number
		 * @param {Array} value.value - an array of values
		 * @returns {module:nbt.Writer} itself */
		[nbt.tagTypes.list](value: ListTag["value"]): this {
			this.byte(nbt.tagTypes[value.type]);
			this.int(value.value.length);
			var i;
			for (i = 0; i < value.value.length; i++) {
				// @ts-expect-error
				this[value.type](value.value[i]);
			}
			return this;
		};
		list = this[tagTypes["list"]];

		/**
		 * @method module:nbt.Writer#compound
		 * @param {Object} value - a key/value map
		 * @param {Object} value.KEY
		 * @param {string} value.KEY.type - the NBT type number
		 * @param {Object} value.KEY.value - a value matching the type
		 * @returns {module:nbt.Writer} itself
		 *
		 * @example
		 * writer.compound({
		 *     foo: { type: 'int', value: 12 },
		 *     bar: { type: 'string', value: 'Hello, World!' }
		 * }); */
		[nbt.tagTypes.compound](value: CompoundTag["value"]): this {
			var self = this;
			Object.keys(value).map(function (key) {
				self.byte(nbt.tagTypes[value[key]!.type]);
				self.string(key);
				// @ts-expect-error
				self[value[key].type as Exclude<TagTypeName,"end">](value[key].value as Tag);
			});
			this.byte(nbt.tagTypes.end);
			return this;
		};
		compound = this[tagTypes["compound"]];
	};

	/**
	 * In addition to the named writing methods documented below,
	 * the same methods are indexed by the NBT type number as well,
	 * as shown in the example below.
	 *
	 * @see {@link nbt.Writer}
	 *
	 * @example
	 * var reader = new nbt.Reader(buf);
	 * int x = reader.int();
	 * int y = reader[3]();
	 * int z = reader[nbt.tagTypes.int](); */
	export class Reader {
		declare private buffer: ArrayBuffer | Uint8Array;
		declare private arrayView: Uint8Array;
		declare private dataView: DataView;

		constructor(buffer: ArrayBuffer | Uint8Array) {
			if (!buffer) { throw new Error('Argument "buffer" is falsy'); }

			this.buffer = buffer;
			this.arrayView = new Uint8Array(this.buffer);
			this.dataView = new DataView(this.arrayView.buffer);

			for (const [base,alias] of Object.entries(tagTypes) as [TagTypeName,TagType][]){
				// @ts-expect-error
				this[alias] = this[base];
			}
		}


			/**
			 * The current location in the buffer. Can be freely changed
			 * within the bounds of the buffer.
			*/
			private offset: number = 0;

			private read(dataType: 'Int8' | 'Uint8' | 'Int16' | 'Int32' | 'Float32' | 'Float64', size: number): number {
				var val = this.dataView[`get${dataType}`](this.offset);
				this.offset += size;
				return val;
			}

			/**
			 * @returns the read byte
			*/
			byte(): ByteTag["value"] {
				return this.read('Int8', 1);
			}

			declare [tagTypes.byte]: typeof this.byte;

			/**
			 * @returns the read unsigned byte
			*/
			ubyte(): number {
				return this.read('Uint8', 1);
			}

			// declare [tagTypes.ubyte]: typeof this.ubyte;

			/**
			 * @returns the read signed 16-bit short
			*/
			short(): ShortTag["value"] {
				return this.read('Int16', 2);
			}

			declare [tagTypes.short]: typeof this.short;

			/**
			 * @returns the read signed 32-bit integer
			*/
			int(): IntTag["value"] {
				return this.read('Int32', 4);
			}

			declare [tagTypes.int]: typeof this.int;

			/**
			 * @returns the read signed 32-bit float
			*/
			float(): FloatTag["value"] {
				return this.read('Float32', 4);
			}

			declare [tagTypes.float]: typeof this.float;

			/**
			 * @returns the read signed 64-bit float
			*/
			double(): DoubleTag["value"] {
				return this.read('Float64', 8);
			}

			declare [tagTypes.double]: typeof this.double;

			/**
			 * As JavaScript does not not natively support 64-bit
			 * integers, the value is returned as an array of two
			 * 32-bit integers, the upper and the lower.
			 *
			 * @returns [upper, lower]
			*/
			long(): LongTag["value"] {
				return [this.int(), this.int()];
			};

			declare [tagTypes.long]: typeof this.long;

			/**
			 * @returns the read array
			*/
			byteArray(): number[] {
				var length = this.int();
				var bytes = [];
				var i;
				for (i = 0; i < length; i++) {
					bytes.push(this.byte());
				}
				return bytes;
			};

			declare [tagTypes.byteArray]: typeof this.byteArray;

			/**
			 * @returns the read array of 32-bit ints
			*/
			intArray(): IntArrayTag["value"] {
				var length = this.int();
				var ints = [];
				var i;
				for (i = 0; i < length; i++) {
					ints.push(this.int());
				}
				return ints;
			};

			declare [tagTypes.intArray]: typeof this.intArray;

			/**
			 * As JavaScript does not not natively support 64-bit
			 * integers, the value is returned as an array of arrays of two
			 * 32-bit integers, the upper and the lower.
			 *
			 * @returns the read array of 64-bit ints
			 *     split into [upper, lower]
			*/
			longArray(): LongArrayTag["value"] {
				var length = this.int();
				var longs = [];
				var i;
				for (i = 0; i < length; i++) {
					longs.push(this.long());
				}
				return longs;
			};

			declare [tagTypes.longArray]: typeof this.longArray;

			/**
			 * @returns the read string
			*/
			string(): StringTag["value"] {
				var length = this.short();
				var slice = sliceUint8Array(this.arrayView, this.offset,
					this.offset + length);
				this.offset += length;
				return decodeUTF8(slice);
			};

			declare [tagTypes.string]: typeof this.string;

			/**
			 * @example
			 * reader.list();
			 * // -> { type: 'string', values: ['foo', 'bar'] }
			*/
			list(): ListTag["value"] {
				var type = this.byte() as TagType;
				var length = this.int();
				var values: Tag["value"][] = [];
				var i: number;
				for (i = 0; i < length; i++) {
					values.push(this[type as Exclude<typeof type,0>]() as Tag["value"]);
				}
				// @ts-expect-error
				return { type: tagTypeNames[type], value: values };
			};

			declare [tagTypes.list]: typeof this.list;

			/**
			 * @example
			 * reader.compound();
			 * // -> { foo: { type: int, value: 42 },
			 * //      bar: { type: string, value: 'Hello! }}
			*/
			compound(): CompoundTag["value"] {
				var values: CompoundTag["value"] = {};
				while (true) {
					var type = this.byte() as TagType;
					if (type === tagTypes.end) {
						break;
					}
					var name = this.string();
					var value = this[type]();
					// @ts-expect-error
					values[name] = { type: tagTypeNames[type], value: value };
				}
				return values;
			};

			declare [tagTypes.compound]: typeof this.compound;
	}

	/**
	 * @param value a named compound
	 * @param value.name the top-level name
	 * @param value.value a compound
	 *
	 * @see {@link nbt.parseUncompressed}
	 * @see {@link nbt.Writer.prototype.compound}
	 *
	 * @example
	 * nbt.writeUncompressed({
	 *     name: 'My Level',
	 *     value: {
	 *         foo: { type: int, value: 42 },
	 *         bar: { type: string, value: 'Hi!' }
	 *     }
	 * }); */
	export function writeUncompressed(value: RootTag): ArrayBuffer {
		if (!value) { throw new Error('Argument "value" is falsy'); }

		var writer = new nbt.Writer();

		writer.byte(nbt.tagTypes.compound);
		writer.string(value.name);
		writer.compound(value.value);

		return writer.getData();
	};

	/**
	 * @param data an uncompressed NBT archive
	 * @returns a named compound
	 *
	 * @see {@link nbt.parse}
	 * @see {@link nbt.writeUncompressed}
	 *
	 * @example
	 * nbt.readUncompressed(buf);
	 * // -> { name: 'My Level',
	 * //      value: { foo: { type: int, value: 42 },
	 * //               bar: { type: string, value: 'Hi!' }}} */
	export function parseUncompressed(data: ArrayBuffer | Uint8Array): RootTag {
		if (!data) { throw new Error('Argument "data" is falsy'); }

		var reader = new nbt.Reader(data);

		var type = reader.byte();
		if (type !== nbt.tagTypes.compound) {
			throw new Error('Top tag should be a compound');
		}

		return {
			name: reader.string(),
			value: reader.compound()
		};
	};

	/**
	 * @param result a named compound
	 * @param result.name the top-level name
	 * @param result.value the top-level compound
	*/
	type parseCallback = {
		(error: Error, result: null): void;
		(error: null, result: RootTag): void;
	}

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
	 * @see {@link nbt.parseUncompressed}
	 * @see {@link nbt.Reader.prototype.compound}
	 *
	 * @example
	 * nbt.parse(buf, function(error, results) {
	 *     if (error) {
	 *         throw error;
	 *     }
	 *     console.log(result.name);
	 *     console.log(result.value.foo);
	 * }); */
	export function parse(data: ArrayBuffer | Uint8Array, callback: parseCallback): void {
		if (!data) { throw new Error('Argument "data" is falsy'); }

		var self = nbt;

		if (!hasGzipHeader(data)) {
			callback(null, self.parseUncompressed(data));
		} else if (!zlib) {
			callback(new Error('NBT archive is compressed but zlib is not ' +
				'available'), null);
		} else {
			/* zlib.gunzip take a Buffer, at least in Node, so try to convert
			   if possible. */
			var buffer: Uint8Array | Buffer;
			if ("length" in data) {
				buffer = data;
			} else if (typeof Buffer !== 'undefined') {
				buffer = new Buffer(data);
			} else {
				/* In the browser? Unknown zlib library. Let's settle for
				   Uint8Array and see what happens. */
				buffer = new Uint8Array(data);
			}

			zlib.gunzip(buffer, function(error, uncompressed) {
				if (error) {
					callback(error, null);
				} else {
					callback(null, self.parseUncompressed(uncompressed));
				}
			});
		}
	};
};