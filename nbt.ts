/*
	NBT.js - a JavaScript parser for NBT archives
	by Sijmen Mulder

	I, the copyright holder of this work, hereby release it into the public
	domain. This applies worldwide.

	In case this is not legally possible: I grant anyone the right to use this
	work for any purpose, without any conditions, unless such conditions are
	required by law.
*/

	if (typeof ArrayBuffer === 'undefined') {
		throw new Error('Missing required type ArrayBuffer');
	}
	if (typeof DataView === 'undefined') {
		throw new Error('Missing required type DataView');
	}
	if (typeof Uint8Array === 'undefined') {
		throw new Error('Missing required type Uint8Array');
	}

	var zlib = typeof require !== 'undefined' ? require('zlib') as typeof window.zlib : window.zlib;

	/**
	 * A mapping from type names to NBT type numbers.
	 * {@link Writer} and {@link Reader}
	 * have correspoding methods (e.g. {@link Writer.prototype.int})
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

	/**
	 * A mapping from NBT type numbers to type names.
	*/
	export const tagTypeNames = {} as {
    [P in tagTypes[keyof tagTypes]]: {
        [K in keyof tagTypes]: tagTypes[K] extends P ? K : never
    }[keyof tagTypes]
	};

	export type tagTypeNames = typeof tagTypeNames;

	(function() {
		for (var typeName in tagTypes) {
			if (tagTypes.hasOwnProperty(typeName)) {
				// @ts-expect-error - indexing
				tagTypeNames[tagTypes[typeName]] = typeName;
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
			if ((array[i] & 0x80) === 0) {
				codepoints.push(array[i] & 0x7F);
			} else if (i+1 < array.length &&
						(array[i]   & 0xE0) === 0xC0 &&
						(array[i+1] & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]   & 0x1F) << 6) |
					( array[i+1] & 0x3F));
			} else if (i+2 < array.length &&
						(array[i]   & 0xF0) === 0xE0 &&
						(array[i+1] & 0xC0) === 0x80 &&
						(array[i+2] & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]   & 0x0F) << 12) |
					((array[i+1] & 0x3F) <<  6) |
					( array[i+2] & 0x3F));
			} else if (i+3 < array.length &&
						(array[i]   & 0xF8) === 0xF0 &&
						(array[i+1] & 0xC0) === 0x80 &&
						(array[i+2] & 0xC0) === 0x80 &&
						(array[i+3] & 0xC0) === 0x80) {
				codepoints.push(
					((array[i]   & 0x07) << 18) |
					((array[i+1] & 0x3F) << 12) |
					((array[i+2] & 0x3F) <<  6) |
					( array[i+3] & 0x3F));
			}
		}
		return String.fromCharCode.apply(null, codepoints);
	}

	/**
	 * Not all environments, in particular PhantomJS, supply
	 * Uint8Array.slice()
	*/
	function sliceUint8Array(array: Uint8Array, begin?: number, end?: number): Uint8Array {
		if ('slice' in array) {
			return array.slice(begin, end);
		} else {
			return new Uint8Array([].slice.call(array, begin, end));
		}
	}

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
	export class Writer {
			/**
			 * Will be resized (x2) on write if necessary.
			*/
			private buffer = new ArrayBuffer(1024);

			/**
			 * This is recreated when the buffer is.
			*/
			private dataView = new DataView(this.buffer);
			/**
			 * This is recreated when the buffer is.
			*/
			private arrayView = new Uint8Array(this.buffer);

			/**
			 * The location in the buffer where bytes are written or read.
			 * This increases after every write, but can be freely changed.
			 * The buffer will be resized when necessary.
			*/
			private offset = 0;

			/**
			 * Ensures that the buffer is large enough to write `size` bytes
			 * at the current `this.offset`.
			*/
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

		private write(dataType: string, size: number, value: any): this {
				this.accommodate(size);
				// @ts-expect-error - indexing again
				this.dataView['set' + dataType](this.offset, value);
				this.offset += size;
				return this;
			}

			/**
			 * Returns the writen data as a slice from the internal buffer,
			 * cutting off any padding at the end.
			 *
			 * @returns a [0, offset] slice of the interal buffer
			*/
			getData(): ArrayBuffer {
				this.accommodate(0); /* make sure the offset is inside the buffer */
				return this.buffer.slice(0, this.offset);
			};

			/**
			 * @param value a signed byte
			*/
			byte: (value: number) => this = this.write.bind(this, 'Int8', 1);

			/**
			 * @param value an unsigned byte
			*/
			ubyte: (value: number) => this = this.write.bind(this, 'Uint8', 1);

			/**
			 * @param value a signed 16-bit integer
			*/
			short: (value: number) => this = this.write.bind(this, 'Int16', 2);

			/**
			 * @param value a signed 32-bit integer
			*/
			int: (value: number) => this = this.write.bind(this, 'Int32', 4);

			/**
			 * @param value a signed 32-bit float
			*/
			float: (value: number) => this = this.write.bind(this, 'Float32', 4);

			/**
			 * @param value a signed 64-bit float
			*/
			double: (value: number) => this = this.write.bind(this, 'Float64', 8);

			/**
			 * As JavaScript does not support 64-bit integers natively, this
			 * method takes an array of two 32-bit integers that make up the
			 * upper and lower halves of the long.
			 *
			 * @param value [upper, lower]
			*/
			long(value: [number,number]): this {
				this.int(value[0]);
				this.int(value[1]);
				return this;
			};

			byteArray(value: Uint8Array): this {
				this.int(value.length);
				this.accommodate(value.length);
				this.arrayView.set(value, this.offset);
				this.offset += value.length;
				return this;
			};

			intArray(value: number[]): this {
				this.int(value.length);
				var i;
				for (i = 0; i < value.length; i++) {
					this.int(value[i]);
				}
				return this;
			};

			longArray(value: [number,number][]): this {
				this.int(value.length);
				var i;
				for (i = 0; i < value.length; i++) {
					this.long(value[i]);
				}
				return this;
			};

			string(value: string): this {
				var bytes = encodeUTF8(value);
				this.short(bytes.length);
				this.accommodate(bytes.length);
				this.arrayView.set(bytes, this.offset);
				this.offset += bytes.length;
				return this;
			};

			/**
			 * @param value.type the NBT type number
			 * @param value.value an array of values
			*/
			list(value: { type: number; value: Array<any>; }): this {
				// @ts-expect-error
				this.byte(tagTypes[value.type]);
				this.int(value.value.length);
				var i;
				for (i = 0; i < value.value.length; i++) {
					// @ts-expect-error
					this[value.type](value.value[i]);
				}
				return this;
			};

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
			compound(value: { KEY: { type: string; value: object; }; }): this {
				Object.keys(value).map(key => {
					// @ts-expect-error
					this.byte(tagTypes[value[key].type]);
					this.string(key);
					// @ts-expect-error
					this[value[key].type](value[key].value);
				});
				this.byte(tagTypes.end);
				return this;
			}
	};

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
	export class Reader {
		declare private buffer: ArrayBuffer | Uint8Array;
		declare private arrayView: Uint8Array;
		declare private dataView: DataView;

		constructor(buffer: ArrayBuffer | Uint8Array) {
			if (!buffer) { throw new Error('Argument "buffer" is falsy'); }

			this.buffer = buffer;
			this.arrayView = new Uint8Array(this.buffer);
			this.dataView = new DataView(this.arrayView.buffer);

			var typeName;
			for (typeName in tagTypes) {
				if (tagTypes.hasOwnProperty(typeName)) {
					// @ts-expect-error
					this[typeName] = this[tagTypes[typeName]];
				}
			}
		}


			/**
			 * The current location in the buffer. Can be freely changed
			 * within the bounds of the buffer.
			*/
			private offset: number = 0;

			private read(dataType: string, size: number): number {
				// @ts-expect-error
				var val = dataView['get' + dataType](this.offset);
				this.offset += size;
				return val;
			}

			/**
			 * @returns the read byte
			*/
			byte: () => number = this.read.bind(this, 'Int8', 1);

			/**
			 * @returns the read unsigned byte
			*/
			ubyte: () => number = this.read.bind(this, 'Uint8', 1);

			/**
			 * @returns the read signed 16-bit short
			*/
			short: () => number = this.read.bind(this, 'Int16', 2);

			/**
			 * @returns the read signed 32-bit integer
			*/
			int: () => number = this.read.bind(this, 'Int32', 4);

			/**
			 * @returns the read signed 32-bit float
			*/
			float: () => number = this.read.bind(this, 'Float32', 4);

			/**
			 * @returns the read signed 64-bit float
			*/
			double: () => number = this.read.bind(this, 'Float64', 8);

			/**
			 * As JavaScript does not not natively support 64-bit
			 * integers, the value is returned as an array of two
			 * 32-bit integers, the upper and the lower.
			 *
			 * @returns [upper, lower]
			*/
			long(): [number,number] {
				return [this.int(), this.int()];
			};

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

			/**
			 * @returns the read array of 32-bit ints
			*/
			intArray(): number[] {
				var length = this.int();
				var ints = [];
				var i;
				for (i = 0; i < length; i++) {
					ints.push(this.int());
				}
				return ints;
			};

			/**
			 * As JavaScript does not not natively support 64-bit
			 * integers, the value is returned as an array of arrays of two
			 * 32-bit integers, the upper and the lower.
			 *
			 * @returns the read array of 64-bit ints
			 *     split into [upper, lower]
			*/
			longArray(): [number,number][] {
				var length = this.int();
				var longs = [];
				var i;
				for (i = 0; i < length; i++) {
					longs.push(this.long());
				}
				return longs;
			};

			/**
			 * @returns the read string
			*/
			string(): string {
				var length = this.short();
				var slice = sliceUint8Array(this.arrayView, this.offset,
					this.offset + length);
				this.offset += length;
				return decodeUTF8(slice);
			};

			/**
			 * @example
			 * reader.list();
			 * // -> { type: 'string', values: ['foo', 'bar'] }
			*/
			list(): { type: string; value: any[]; } {
				var type = this.byte();
				var length = this.int();
				var values = [];
				var i;
				for (i = 0; i < length; i++) {
					// @ts-expect-error
					values.push(this[type]());
				}
				return { type:
					// @ts-expect-error
					tagTypeNames[type],
					value: values };
			};

			/**
			 * @example
			 * reader.compound();
			 * // -> { foo: { type: int, value: 42 },
			 * //      bar: { type: string, value: 'Hello! }}
			*/
			compound(): { [s: string]: { type: string; value: any; }; } {
				var values = {};
				while (true) {
					var type = this.byte();
					if (type === tagTypes.end) {
						break;
					}
					var name = this.string();
					// @ts-expect-error
					var value = this[type]();
					// @ts-expect-error
					values[name] = { type: tagTypeNames[type], value: value };
				}
				return values;
			};

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
	export function writeUncompressed(value: { name: string; value: object; }): ArrayBuffer {
		if (!value) { throw new Error('Argument "value" is falsy'); }

		var writer = new Writer();

		writer.byte(tagTypes.compound);
		writer.string(value.name);
		// @ts-expect-error
		writer.compound(value.value);

		return writer.getData();
	};

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
	export function parseUncompressed(data: ArrayBuffer | Uint8Array): { name: string; value: { [s: string]: Object; }; } {
		if (!data) { throw new Error('Argument "data" is falsy'); }

		var reader = new Reader(data);

		var type = reader.byte();
		if (type !== tagTypes.compound) {
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
	type parseCallback = (error?: object | null, result?: { name: string; value: any; } | null) => void;

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
	export function parse(data: ArrayBuffer | Uint8Array, callback: parseCallback): void {
		if (!data) { throw new Error('Argument "data" is falsy'); }

		if (!hasGzipHeader(data)) {
			callback(null, parseUncompressed(data));
		} else if (!zlib) {
			callback(new Error('NBT archive is compressed but zlib is not ' +
				'available'), null);
		} else {
			/**
			 * zlib.gunzip take a Buffer, at least in Node, so try to convert
			 * if possible.
			*/
			var buffer: Uint8Array;
			if ("length" in data) {
				buffer = data;
			} else if (typeof Buffer !== 'undefined') {
				buffer = new Buffer(data);
			} else {
				/**
				 * In the browser? Unknown zlib library. Let's settle for
				 * Uint8Array and see what happens.
				*/
				buffer = new Uint8Array(data);
			}

			zlib.gunzip(buffer, function(error,uncompressed) {
				if (error) {
					callback(error, null);
				} else {
					callback(null, parseUncompressed(uncompressed));
				}
			});
		}
	};