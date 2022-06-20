var inBrowser = typeof console != "undefined";

if (!inBrowser) {
  console = {
    info: print,
    warn: print
  };
}

function backtrace() {
  try {
    throw new Error();
  } catch (e) {
    return e.stack ? e.stack.split('\n').slice(2).join('\n') : '';
  }
}

function error(message) {
  if (!inBrowser) {
    console.info(backtrace());
  }
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) {
    error(message);
  }
}

function assertFalse(condition, message) {
  if (condition) {
    error(message);
  }
}

function assertNotImplemented(condition, message) {
  if (!condition) {
    error(message);
  }
}

function warning(message) {
  console.warn(message);
}

function notImplemented(message) {
  assert(false, "Not Implemented " + message);
}

function unexpected(message) {
  assert(false, message);
}

function defineReadOnlyProperty(obj, name, value) {
  Object.defineProperty(obj, name, { value: value,
                                     writable: false,
                                     configurable: false,
                                     enumerable: false });
}

function defineGetter(obj, name, getter) {
  Object.defineProperty(obj, name, { get: getter,
                                     configurable: true,
                                     enumerable: true });
}

function defineSetter(obj, name, setter) {
  Object.defineProperty(obj, name, { set: setter,
                                     configurable: true,
                                     enumerable: true });
}


function defineNonEnumerableProperty(obj, name, value) {
  Object.defineProperty(obj, name, { value: value,
                                     writable: true,
                                     configurable: true,
                                     enumerable: false });
}

function clone(obj) {
  var o = {};
  for (var key in obj) {
    o[key] = obj[key];
  }
  return o;
}

function quote(s) {
  return "\"" + s + "\"";
}

function paren(s) {
  return "(" + s + ")";
}

function unparen(s) {
  if (s[0] === "(" && s[s.length - 1] === ")") {
    return s.substring(1, s.length - 1);
  }
  return s;
}

function mapObject(obj, fn) {
  var a = [];
  for (var k in obj) {
    if (obj.hasOwnProperty(k)) {
      a.push(fn(k, obj[k]));
    }
  }
  return a;
}

(function () {
  function extendBuiltin(proto, prop, f) {
    if (!proto[prop]) {
      Object.defineProperty(proto, prop,
                            { value: f,
                              writable: true,
                              configurable: true,
                              enumerable: false });
    }
  }

  var Sp = String.prototype;

  extendBuiltin(Sp, "padRight", function (c, n) {
    var str = this;
    if (!c || str.length >= n) {
      return str;
    }
    var max = (n - str.length) / c.length;
    for (var i = 0; i < max; i++) {
      str += c;
    }
    return str;
  });

  var Ap = Array.prototype;

  extendBuiltin(Ap, "popMany", function (count) {
    assert (this.length >= count);
    var start = this.length - count;
    var res = this.slice(start, this.length);
    this.splice(start, count);
    return res;
  });

  extendBuiltin(Ap, "first", function () {
    assert (this.length > 0);
    return this[0];
  });

  extendBuiltin(Ap, "peek", function() {
    assert (this.length > 0);
    return this[this.length - 1];
  });

  extendBuiltin(Ap, "empty", function() {
    return this.length === 0;
  });

  extendBuiltin(Ap, "notEmpty", function() {
    return this.length > 0;
  });

  extendBuiltin(Ap, "contains", function(val) {
    return this.indexOf(val) >= 0;
  });

  extendBuiltin(Ap, "top", function() {
    return this.length && this[this.length - 1];
  });

  extendBuiltin(Ap, "last", function() {
    return this.length && this[this.length - 1];
  });

  extendBuiltin(Ap, "mapWithIndex", function(fn) {
    var arr = [];
    for (var i = 0; i < this.length; i++) {
      arr.push(fn(this[i], i));
    }
    return arr;
  });
})();

/**
 * Creates a new prototype object derived from another objects prototype along with a list of additional properties.
 */
function inherit(base, properties) {
  var prot = Object.create(base.prototype);
  for (var p in properties) {
    prot[p] = properties[p];
  }
  return prot;
}

function getFlags(value, flags) {
  var str = "";
  for (var i = 0; i < flags.length; i++) {
    if (value & (1 << i)) {
      str += flags[i] + " ";
    }
  }
  if (str.length === 0) {
    return "";
  }
  return str.trim();
}


var OptionSet = (function () {
  function optionSet (name) {
    this.name = name;
    this.options = [];
  }
  optionSet.prototype.register = function register(option) {
    this.options.push(option);
    return option;
  };
  optionSet.prototype.parse = function parse(arguments) {
    var args = arguments.slice(0);
    this.options.forEach(function (option) {
      for (var i = 0; i < args.length; i++) {
        if (args[i] && option.tryParse(args[i])) {
          args[i] = null;
        }
      }
    });
  };
  optionSet.prototype.trace = function trace(writer) {
    writer.enter(this.name + " {");
    this.options.forEach(function (option) {
      option.trace(writer);
    });
    writer.leave("}");
  };
  return optionSet;
})();

var Option = (function () {
  function option(name, shortName, defaultValue, description) {
    this.name = name;
    this.shortName = shortName;
    this.defaultValue = defaultValue;
    this.value = defaultValue;
    this.description = description;
  }
  option.prototype.trace = function trace(writer) {
    writer.writeLn(("-" + this.shortName + " (" + this.name + ")").padRight(" ", 20) + " = " + this.value + " [" + this.defaultValue + "]" + " (" + this.description + ")");
  };
  option.prototype.tryParse = function tryParse(str) {
    if (str.indexOf("-" + this.shortName) === 0) {
      if (str.indexOf("=") >= 0) {
        this.value = eval(str.slice(str.indexOf("=") + 1).trim());
      } else if (str == "-" + this.shortName) {
        this.value = true;
      } else {
        return false;
      }
      return true;
    }
    return false;
  };
  return option;
})();

/**
 * BitSet backed by a typed array. We intentionally leave out assertions for performance reasons. We
 * assume that all indices are within bounds, and that set operations are applied to equal sized sets.
 * Inspired by Maxine's BitMap.
 *
 * If the set fits in a single word, a single int is used.
 */
function BitSetFunctor(length) {
  const ADDRESS_BITS_PER_WORD = 5;
  const BITS_PER_WORD = 1 << ADDRESS_BITS_PER_WORD;
  const BIT_INDEX_MASK = BITS_PER_WORD - 1;
  const SIZE = ((length + (BITS_PER_WORD - 1)) >> ADDRESS_BITS_PER_WORD) << ADDRESS_BITS_PER_WORD;

  function BitSet() {
    /* How many bits are set. */
    this.count = 0;
    /* Do we need to recompute the count? */
    this.dirty = 0;
    /* Size of the bit array. */
    this.size = SIZE;
    /* The word array. */
    this.bits = new Uint32Array(SIZE >> ADDRESS_BITS_PER_WORD);
  }

  function BitSetS() {
    this.count = 0;
    this.dirty = 0;
    this.size = SIZE;
    this.bits = 0;
  }

  var singleword = (SIZE >> ADDRESS_BITS_PER_WORD) === 1
  var Ctor = singleword ? BitSetS : BitSet;

  Ctor.ADDRESS_BITS_PER_WORD = ADDRESS_BITS_PER_WORD;
  Ctor.BITS_PER_WORD = BITS_PER_WORD;
  Ctor.BIT_INDEX_MASK = BIT_INDEX_MASK;
  Ctor.singleword = singleword;

  BitSet.prototype = {
    recount: function recount() {
      if (!this.dirty) {
        return;
      }

      var bits = this.bits;
      var c = 0;
      for (var i = 0, j = bits.length; i < j; i++) {
        var v = bits[i];
        v = v - ((v >> 1) & 0x55555555);
        v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
        c += ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;
      }

      this.count = c;
      this.dirty = 0;
    },

    set: function set(i) {
      var n = i >> ADDRESS_BITS_PER_WORD;
      var old = this.bits[n];
      var b = old | (1 << (i & BIT_INDEX_MASK));
      this.bits[n] = b;
      this.dirty |= old ^ b;
    },

    setAll: function setAll() {
      var bits = this.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        bits[i] = 0xFFFFFFFF;
      }
      this.count = this.size;
      this.dirty = 0;
    },

    clear: function clear(i) {
      var n = i >> ADDRESS_BITS_PER_WORD;
      var old = this.bits[n];
      var b = old & ~(1 << (i & BIT_INDEX_MASK));
      this.bits[n] = b;
      this.dirty |= old ^ b;
    },

    get: function get(i) {
      var word = this.bits[i >> ADDRESS_BITS_PER_WORD];
      return ((word & 1 << (i & BIT_INDEX_MASK))) !== 0;
    },

    clearAll: function clearAll() {
      var bits = this.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        bits[i] = 0;
      }
      this.count = 0;
      this.dirty = 0;
    },

    union: function union(other) {
      var dirty = this.dirty;
      var bits = this.bits;
      var otherBits = other.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var old = bits[i];
        var b = old | otherBits[i];
        bits[i] = b;
        dirty |= old ^ b;
      }
      this.dirty = dirty;
    },

    intersect: function intersect(other) {
      var dirty = this.dirty;
      var bits = this.bits;
      var otherBits = other.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var old = bits[i];
        var b = old & otherBits[i];
        bits[i] = b;
        dirty |= old ^ b;
      }
      this.dirty = dirty;
    },

    subtract: function subtract(other) {
      var dirty = this.dirty;
      var bits = this.bits;
      var otherBits = other.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var old = bits[i];
        var b = old & ~otherBits[i];
        bits[i] = b;
        dirty |= old ^ b;
      }
      this.dirty = dirty;
    },

    negate: function negate() {
      var dirty = this.dirty;
      var bits = this.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var old = bits[i];
        var b = ~old;
        bits[i] = b;
        dirty |= old ^ b;
      }
      this.dirty = dirty;
    },

    forEach: function forEach(fn) {
      assert (fn);
      var bits = this.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var word = bits[i];
        if (word) {
          for (var k = 0; k < BITS_PER_WORD; k++) {
            if (word & (1 << k)) {
              fn(i * BITS_PER_WORD + k);
            }
          }
        }
      }
    },

    toArray: function toArray() {
      var set = [];
      var bits = this.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        var word = bits[i];
        if (word) {
          for (var k = 0; k < BITS_PER_WORD; k++) {
            if (word & (1 << k)) {
              set.push(i * BITS_PER_WORD + k);
            }
          }
        }
      }
      return set;
    },

    equals: function equals(other) {
      if (this.size !== other.size) {
        return false;
      }
      var bits = this.bits;
      var otherBits = other.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        if (bits[i] !== otherBits[i]) {
          return false;
        }
      }
      return true;
    },

    contains: function contains(other) {
      if (this.size !== other.size) {
        return false;
      }
      var bits = this.bits;
      var otherBits = other.bits;
      for (var i = 0, j = bits.length; i < j; i++) {
        if ((bits[i] | otherBits[i]) !== bits[i]) {
          return false;
        }
      }
      return true;
    },

    toBitString: function toBitString() {
      var str = "";
      for (var i = 0; i < length; i++) {
        str += this.get(i) ? "1" : "0";
      }
      return str;
    },

    toString: function toString() {
      var set = [];
      for (var i = 0; i < length; i++) {
        if (this.get(i)) {
          set.push(i);
        }
      }
      return set.join(", ");
    }
  };

  BitSetS.prototype = {
    recount: function recount() {
      if (!this.dirty) {
        return;
      }

      var c = 0;
      var v = this.bits;
      v = v - ((v >> 1) & 0x55555555);
      v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
      c += ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >> 24;

      this.count = c;
      this.dirty = 0;
    },

    set: function set(i) {
      var old = this.bits;
      var b = old | (1 << (i & BIT_INDEX_MASK));
      this.bits = b;
      this.dirty |= old ^ b;
    },

    setAll: function setAll() {
      this.bits = 0xFFFFFFFF;
      this.count = this.size;
      this.dirty = 0;
    },

    clear: function clear(i) {
      var old = this.bits;
      var b = old & ~(1 << (i & BIT_INDEX_MASK));
      this.bits = b;
      this.dirty |= old ^ b;
    },

    get: function get(i) {
      return ((this.bits & 1 << (i & BIT_INDEX_MASK))) !== 0;
    },

    clearAll: function clearAll() {
      this.bits = 0;
      this.count = 0;
      this.dirty = 0;
    },

    union: function union(other) {
      var old = this.bits;
      var b = old | other.bits;
      this.bits = b;
      this.dirty = old ^ b;
    },

    intersect: function intersect(other) {
      var old = this.bits;
      var b = old & other.bits;
      this.bits = b;
      this.dirty = old ^ b;
    },

    subtract: function subtract(other) {
      var old = this.bits;
      var b = old & ~other.bits;
      this.bits = b;
      this.dirty = old ^ b;
    },

    negate: function negate() {
      var old = this.bits;
      var b = ~old;
      this.bits = b;
      this.dirty = old ^ b;
    },

    forEach: function forEach(fn) {
      assert (fn);
      var word = this.bits;
      if (word) {
        for (var k = 0; k < BITS_PER_WORD; k++) {
          if (word & (1 << k)) {
            fn(k);
          }
        }
      }
    },

    toArray: function toArray() {
      var set = [];
      var word = this.bits;
      if (word) {
        for (var k = 0; k < BITS_PER_WORD; k++) {
          if (word & (1 << k)) {
            set.push(k);
          }
        }
      }
      return set;
    },

    equals: function equals(other) {
      return this.bits === other.bits;
    },

    contains: function contains(other) {
      var bits = this.bits;
      return (bits | other.bits) === bits;
    },

    toBitString: BitSet.prototype.toBitString,
    toString: BitSet.prototype.toString
  };

  return Ctor;
};


var consoleWriter = {
  writeLn: function (x) {
    console.info(x);
  }
};

var IndentingWriter = (function () {
  function indentingWriter(suppressOutput, out) {
    this.tab = "  ";
    this.padding = "";
    this.suppressOutput = suppressOutput;
    this.out = out || consoleWriter;
  }

  indentingWriter.prototype.writeLn = function writeLn(str) {
    if (!this.suppressOutput) {
      this.out.writeLn(this.padding + str);
    }
  };

  indentingWriter.prototype.enter = function enter(str) {
    if (!this.suppressOutput) {
      this.out.writeLn(this.padding + str);
    }
    this.indent();
  };

  indentingWriter.prototype.leave = function leave(str) {
    this.outdent();
    if (!this.suppressOutput) {
      this.out.writeLn(this.padding + str);
    }
  };

  indentingWriter.prototype.leaveAndEnter = function leaveAndEnter(str) {
    this.outdent();
    if (!this.suppressOutput) {
      this.out.writeLn(this.padding + str);
    }
    this.indent();
  };

  indentingWriter.prototype.indent = function indent() {
    this.padding += this.tab;
  };

  indentingWriter.prototype.outdent = function outdent() {
    if (this.padding.length > 0) {
      this.padding = this.padding.substring(0, this.padding.length - this.tab.length);
    }
  };

  indentingWriter.prototype.writeArray = function writeArray(arr, detailed) {
    detailed = detailed || false;
    for (var i = 0, j = arr.length; i < j; i++) {
      var prefix = "";
      if (detailed) {
        if (arr[i] === null) {
          prefix = "null";
        } else if (arr[i] === undefined) {
          prefix = "undefined";
        } else {
          prefix = arr[i].constructor.name;
        }
        prefix += " ";
      }
      this.writeLn(("" + i).padRight(' ', 4) + prefix + arr[i]);
    }
  };

  return indentingWriter;
})();