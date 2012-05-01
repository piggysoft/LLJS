var Type = (function () {
  function type(name, size, defaultValue) {
    this.name = name;
    this.size = size;
    this.defaultValue = defaultValue;
  };

  type.prototype.toString = function () {
    return this.name;
  };

  type.prototype.toJSON = function () {
    return this.name;
  };

  type.prototype.getSize = function () {
    assert (this.size);
    return this.size;
  };

  type.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    return this === other;
  };

  return type;
})();

var StructType = (function () {
  function structType(name) {
    this.name = name;
    this.fields = [];
    this.offset = 0;
  }

  structType.prototype = Object.create(Type.prototype);

  structType.prototype.getSize = function () {
    assert (this.fields);
    var size = 0;
    this.fields.forEach(function (field) {
      size += field.type.getSize();
    });
    this.size = size;
    return size;
  };

  structType.prototype.addField = function addField(name, type) {
    this.fields.push({name: name, type: type, offset: this.offset});
    this.offset += type.getSize();
  };

  structType.prototype.getField = function getField(name) {
    var fields = this.fields;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].name === name) {
        return fields[i];
      }
    }
    return null;
  };

  return structType;
})();

var PointerType = (function () {
  function pointerType(type) {
    this.type = type;
    if (type instanceof pointerType) {
      this.base = type.base;
      this.pointers = type.pointers + 1;
    } else {
      this.base = type;
      this.pointers = 0;
    }
  };
  function stars(n) {
    var str = "";
    while (n--) {
      str += "*";
    }
    return str;
  }

  pointerType.prototype.defaultValue = 0;

  pointerType.prototype.toString = function () {
    if (this.name) {
      return this.name;
    }
    if (this.type instanceof FunctionType) {
      return this.name = this.type.returnType.toString() + "(*)" + "(" + this.type.parameterTypes.join(", ") + ")";
    } else {
      return this.name = this.type.toString() + "*";
    }
  };
  pointerType.prototype.toJSON = function () {
    return this.toString();
  };
  pointerType.prototype.getSize = function () {
    return 4;
  };
  pointerType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    if (this.base === types.void && other instanceof PointerType) {
      return true;
    }
    return other instanceof PointerType && this.base.assignableFrom(other.base) && this.pointers === other.pointers;
  };
  return pointerType;
})();

var FunctionType = (function () {
  function functionType(returnType, parameterTypes) {
    this.returnType = returnType;
    this.parameterTypes = parameterTypes;
  }
  functionType.prototype.toString = function () {
    return this.name || (this.name = this.returnType + "(" + this.parameterTypes.join(", ") + ")");
  };
  functionType.prototype.toJSON = function () {
    return this.toString();
  };
  functionType.prototype.assignableFrom = function (other) {
    if (other === types.void) {
      return true;
    }
    if (other === types.null) {
      return true;
    }
    return other instanceof FunctionType;
  };
  functionType.prototype.getSize = function () {
    return 4;
  };
  return functionType;
})();

var types = {
  int:  new Type("int",  4, 0),
  uint: new Type("uint", 4, 0),

  u8:   new Type("u8",   1, 0),
  i8:   new Type("i8",   1, 0),
  u16:  new Type("u16",  2, 0),
  i16:  new Type("i16",  2, 0),
  u32:  new Type("u32",  4, 0),
  i32:  new Type("i32",  4, 0),

  void: new Type("void", undefined, 0),
  dyn:  new Type("dyn",  undefined, 0)
};

function getType(name) {
  assert (name in types, "Type \"" + name + "\" is not found.");
  assert (types[name]);
  return types[name];
}

var Scope = (function () {
  function scope(parent, name) {
    this.name = name;
    this.parent = parent;
    this.types = {};
    this.variables = {};
    this.options = parent ? Object.create(parent.options) : {};
  }

  scope.prototype.getVariable = function getVariable(name, strict, local) {
    var variable = this.variables[name];
    if (variable) {
      return variable;
    } else if (!local && this.parent) {
      return this.parent.getVariable(name, strict);
    }
    if (strict) {
      return unexpected ("Undefined variable " + name);
    }
    return null;
  };

  scope.prototype.addVariable = function addVariable(variable) {
    assert (variable);
    print("Adding variable " + variable + " to scope " + this + ".");
    this.variables[variable.name] = variable;
  };

  scope.prototype.getType = function getType(name) {
    var type = this.types[name];
    if (type) {
      return type;
    } else if (this.parent) {
      return this.parent.getType(name);
    }
    return unexpected ("Undefined type " + name);
  };

  scope.prototype.addType = function addType(type) {
    assert (type);
    print("Adding type " + type + " to scope " + this + ".");
    this.types[type.name] = type;
  };

  scope.prototype.toString = function toString() {
    return this.name;
  };

  scope.prototype.close = function close() {
    var offset = 0;
    for (var key in this.variables) {
      var x = this.variables[key];
      if (x.isStackAllocated || x.type instanceof StructType) {
        x.offset = offset;
        offset += x.type.getSize();
      }
    }
    this.frameSize = offset;
    print(JSON.stringify(this.variables));
  };

  return scope;
})();


var Frame = (function () {
  function frame() {
    this.variables = [];
    this.size = 0;
  }
  frame.prototype.add = function add (variable) {
    assert (variable instanceof Variable);
    this.variables.push(variable);
    variable.offset = this.size;
    this.size += variable.type.getSize();
  };
  return frame;
})();


function walkComputeTypes(nodes, scope, a) {
  return nodes.map(function (x) {
    assert ("computeType" in x, "Node: " + x.tag + " doesn't have a computeType function.");
    return x.computeType(scope, a);
  });
}

function walkCreateTypes(nodes, o) {
  return nodes.map(function (x) {
    assert ("createType" in x, "Node: " + x.tag + " doesn't have a createType function.");
    return x.createType(o);
  });
}

function walkGenerateCode(nodes, writer, scope) {
  return nodes.map(function (x) {
    assert ("generateCode" in x, "Node: " + x.tag + " doesn't have a generateCode function.");
    return x.generateCode(writer, scope);
  });
}

function reportError(node, message) {
  var str = "";
  var position = node.position;

  if (position) {
    /*
     str = source.split("\n")[position.line - 1] + "\n";
     for (var i = 0; i < position.column - 1; i++) {
     str += " ";
     }
     str += "^ ";
     */
    str = "At " + position.line + ":" + position.column + ": " + node.tag + ": ";
  } else {
    str = "At " + node.tag + ": ";
  }

  throw new Error(str + message);
}

function checkTypeAssignment(node, a, b, message) {
  assert (a && b);
  if (!a.assignableFrom(b)) {
    reportError(node, "Unassignable types " + a + " <= " + b + (message ? " " + message : ""));
  }
}

function check(node, condition, message) {
  if (!condition) {
    reportError(node, message);
  }
}

var Variable = (function () {
  function variable(name, type, offset) {
    assert (name && type);
    this.name = name;
    this.type = type;
    this.offset = offset;
  }
  variable.prototype.toString = function () {
    return "variable " + this.name;
  };
  variable.prototype.generateCode = function () {
    if (this.type instanceof StructType) {
      return this.frameOffset();
    } else if (this.isStackAllocated) {
      return accessMemory(this.frameOffset(), this.type);
    }
    return this.name;
  };
  variable.prototype.frameOffset = function () {
    return "$SP + " + this.offset;
  };
  return variable;
})();

function Program (elements) {
  this.tag = "Program";
  this.elements = elements;
}

function createFrame(writer, scope) {
  if (scope.frameSize) {
    // writer.writeLn("tracer.enter(" + quote(scope.name + " {") + ")");
    writer.writeLn("$SP -= " + scope.frameSize + ";");
    for (var key in scope.variables) {
      var variable = scope.variables[key];
      if (variable.isParameter && variable.isStackAllocated) {
        if (variable.type instanceof StructType) {
          writer.writeLn(generateMemoryCopy(variable.generateCode(null, scope), variable.name, variable.type.getSize()) + ";");
        } else {
          writer.writeLn(variable.generateCode(null, scope) + " = " + variable.name + ";");
        }
      }
    }
  }
};

function destroyFrame(writer, scope) {
  if (scope.frameSize) {
    writer.writeLn("$SP += " + scope.frameSize + ";");
    // writer.writeLn("tracer.leave(\"}\");");
  }
};

function computeDeclarations(elements, scope) {
  for (var i = 0; i < elements.length; i++) {
    var node = elements[i];
    if (node instanceof StructDeclaration) {
      assert (!(node.name in types), "Type " + node.name + " is already defined.");
      scope.addType(new StructType(node.name));
    } else if (node instanceof FunctionDeclaration) {
      scope.addVariable(new Variable(node.name, node.computeTypeAndDeclarations(scope)));
    }
  }
}

Program.prototype = {
  computeType: function (types) {
    var scope = this.scope = new Scope(null, "Program");
    scope.types = clone(types);
    scope.addVariable(new Variable("extern", types.dyn));
    computeDeclarations(this.elements, scope);
    walkComputeTypes(this.elements, scope);
    scope.close();
  },
  generateCode: function (writer) {
    createFrame(writer, this.scope);
    walkGenerateCode(this.elements, writer, this.scope);
  }
};

function VariableStatement (typeSpecifier, variableDeclarations, inForStatement) {
  this.tag = "VariableStatement";
  this.typeSpecifier = typeSpecifier;
  this.variableDeclarations = variableDeclarations;
  this.inForStatement = inForStatement;
}

VariableStatement.prototype = {
  computeType: function (scope) {
    var typeSpecifier = this.typeSpecifier;
    this.variableDeclarations.forEach(function (x) {
      x.computeType(typeSpecifier, scope);
      check(x, !scope.getVariable(x.name, false, true), "Variable " + quote(x.name) + " is already declared.");
      scope.addVariable(x.variable = new Variable(x.name, x.type));
    });
    delete this.typeSpecifier;
  },

  generateCode: function (writer, scope) {
    assert (scope);
    var add;
    var str = "";
    if (this.inForStatement) {
      var first = true;
      add = function (name, value) {
        name = name || "_";
        if (first) {
          str = "var ";
        } else {
          str += ", ";
        }
        str += name + " = " + value;
        first = false;
      };
    } else {
      add = function (name, value) {
        name = name || "_";
        writer.writeLn("var " + name + " = " + value + ";");
      };
    }

    this.variableDeclarations.forEach(function (x) {
      if (x.type instanceof StructType) {
        var type = x.variable.type;
        var size = type.getSize();
        if (x.value) {
          add(null, generateMemoryCopy(x.variable.frameOffset(), x.value.generateCode(null, scope), size));
        }
      } else {
        var value = x.value ? x.value.generateCode(null, scope) : x.variable.type.defaultValue;
        if (x.variable.isStackAllocated) {
          add(x.variable.generateCode(),  value);
        } else {
          add(x.name, value);
        }
      }
    });

    if (this.inForStatement) {
      return str;
    }
  }
};

function VariableDeclaration (declarator, value) {
  this.tag = "VariableDeclaration";
  this.declarator = declarator;
  this.value = value;
}

VariableDeclaration.prototype = {
  computeType: function (typeSpecifier, scope) {
    var result = {name: null, type: scope.getType(typeSpecifier)};
    this.declarator.createType(result);
    if (this.value) {
      var vt = this.value.computeType(scope);
      checkTypeAssignment(this, result.type, vt);
    }
    delete this.declarator;
    this.name = result.name;
    this.type = result.type;
  }
};

function Declarator (pointer, directDeclarator) {
  this.tag = "Declarator";
  this.pointer = pointer;
  this.directDeclarator = directDeclarator;
}

Declarator.prototype = {
  createType: function (result) {
    assert (result.type);
    if (this.pointer) {
      for (var i = 0; i < this.pointer.count; i++) {
        result.type = new PointerType(result.type);
      }
    }
    if (this.directDeclarator) {
      this.directDeclarator.createType(result);
    }
  }
};

function DirectDeclarator (name, declarator, declaratorSuffix) {
  this.tag = "DirectDeclarator";
  this.name = name;
  this.declarator = declarator;
  this.declaratorSuffix = declaratorSuffix;
}

DirectDeclarator.prototype = {
  createType: function (result) {
    assert (result.type);
    for (var i = this.declaratorSuffix.length - 1; i >= 0; i--) {
      result.type = this.declaratorSuffix[i].createType(result.type);
    }
    if (this.declarator) {
      this.declarator.createType(result);
    } else if (this.name) {
      result.name = this.name;
    }
  }
};

function FunctionDeclarator (parameters) {
  this.tag = "FunctionDeclarator";
  this.parameters = parameters;
}

FunctionDeclarator.prototype = {
  createType: function (returnType) {
    return new FunctionType(returnType, walkCreateTypes(this.parameters));
  },
  generateCode: function (writer, scope) {

  }
};

function ParameterDeclaration (typeSpecifier, declarator) {
  this.tag = "ParameterDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

ParameterDeclaration.prototype = {
  createType: function (scope) {
    return this.createParameter(scope).type;
  },
  createParameter: function (scope) {
    assert (scope);
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result;
  }
};


function StructDeclaration (name, fields) {
  this.tag = "StructDeclaration";
  this.name = name;
  this.fields = fields;
}

StructDeclaration.prototype = {
  computeType: function (scope) {
    this.type = scope.getType(this.name);
    check(this, this.fields, "Struct " + quote(this.name) + " must have at least one field declaration.");
    walkComputeTypes(this.fields, scope, this.type);
  },
  generateCode: function (writer, scope) {}
};

function FieldDeclaration (typeSpecifier, declarator) {
  this.tag = "StructDeclaration";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

FieldDeclaration.prototype = {
  computeType: function (scope, type) {
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    this.declarator.createType(result);
    type.addField(result.name, result.type);
  }
};

function TypeName (typeSpecifier, declarator) {
  this.tag = "TypeName";
  this.typeSpecifier = typeSpecifier;
  this.declarator = declarator;
}

TypeName.prototype = {
  createType: function (scope) {
    assert (scope);
    var result = {name: null, type: scope.getType(this.typeSpecifier)};
    if (this.declarator) {
      this.declarator.createType(result);
    }
    return result.type;
  },
  computeType: function (scope) {
    return this.createType(scope);
  }
};

function Literal (kind, value) {
  this.tag = "Literal";
  this.kind = kind;
  this.value = value;
}

Literal.prototype = {
  computeType: function () {
    switch (this.kind) {
      case "number": return types.int;
      case "boolean": return types.int;
      case "null": return types.null;
      case "string": return types.dyn;
      default: return notImplemented();
    }
  },
  generateCode: function (writer, scope) {
    assert(!writer);
     switch (this.kind) {
      case "number": return JSON.stringify(this.value);
      case "boolean": return JSON.stringify(this.value);
      case "null": return "null";
      case "string": return JSON.stringify(this.value);
      default: return notImplemented();
    }
  }
};

function FunctionDeclaration (name, returnType, parameters, elements) {
  this.tag = "FunctionDeclaration";
  this.name = name;
  this.returnType = returnType;
  this.parameters = parameters;
  this.elements = elements;
}

FunctionDeclaration.prototype = {
  computeTypeAndDeclarations: function (scope) {
    this.parameters = this.parameters.map(function (x) {
      return x.createParameter(scope);
    });

    var parameterTypes = this.parameters.map(function (x) {
      return x.type;
    });

    this.returnType = this.returnType.createType(scope);
    this.type = new FunctionType(this.returnType, parameterTypes);
    computeDeclarations(this.elements, scope);
    return this.type;
  },
  computeType: function (scope, signatureOnly) {
    this.scope = scope = new Scope(scope, "Function " + this.name);
    scope.options.enclosingFunction = this;
    this.parameters.forEach(function (x) {
      var variable = new Variable(x.name, x.type);
      variable.isParameter = true;
      scope.addVariable(variable);
    });

    walkComputeTypes(this.elements, scope);

    scope.close();

    if (this.type.returnType !== types.void) {
      check(this, this.hasReturn, "Function must return a value of type " + quote(this.type.returnType) + ".");
    }
    return this.type;
  },
  generateCode: function (writer) {
    var scope = this.scope;
    scope.options.frame = new Frame();
    writer.enter("function " + this.name + "(" +
      this.parameters.map(function (x) {
        return x.name;
      }).join(", ") + ") {");
    createFrame(writer, scope);
    walkGenerateCode(this.elements, writer, scope);
    writer.leave("}");
  }
};

function ReturnStatement (value) {
  this.tag = "ReturnStatement";
  this.value = value;
}

ReturnStatement.prototype = {
  computeType: function (scope) {
    var type = this.value.computeType(scope);
    checkTypeAssignment(this, scope.options.enclosingFunction.type.returnType, type);
    scope.options.enclosingFunction.hasReturn = true;
  },
  generateCode: function (writer, scope) {
    var value = (this.value ? " " + this.value.generateCode(null, scope) : "");
    if  (scope.frameSize) {
      writer.writeLn("var $T =" + value + ";");
      destroyFrame(writer, scope);
      writer.writeLn("return $T;");
    } else {
      writer.writeLn("return" + value + ";");
    }
  }
};

function ConditionalExpression (condition, trueExpression, falseExpression) {
  this.tag = "ConditionalExpression";
  this.condition = condition;
  this.trueExpression = trueExpression;
  this.falseExpression = falseExpression;
}

ConditionalExpression.prototype = {
  computeType: function (scope) {
    var ct = this.condition.computeType(scope);
    var tt = this.trueExpression.computeType(scope);
    var ft = this.falseExpression.computeType(scope);
    return tt;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "(" + this.condition.generateCode(null, scope) + " ? " +
      this.trueExpression.generateCode(null, scope) + " : " +
      this.falseExpression.generateCode(null, scope) + ")";
  }
};

function BinaryExpression (operator, left, right) {
  this.tag = "BinaryExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

BinaryExpression.prototype = {
  computeType: function (scope) {
    var lt = this.left.computeType(scope);
    var rt =  this.right.computeType(scope);
    return lt;
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "(" +
      this.left.generateCode(null, scope) + " " +
      this.operator + " " +
      this.right.generateCode(null, scope) +
    ")";
  }
};


function UnaryExpression (operator, expression) {
  this.tag = "UnaryExpression";
  this.operator = operator;
  this.expression = expression;
}

UnaryExpression.prototype = {
  computeType: function (scope) {
    if (this.operator === "sizeof") {
      return types.int;
    } else if (this.operator === "&") {
      var type = this.expression.computeType(scope);
      if (this.expression instanceof VariableIdentifier) {
        this.expression.variable.isStackAllocated = true;
      }
      return this.type = new PointerType(type);
    } else if (this.operator === "*") {
      var type = this.expression.computeType(scope);
      check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
      return type.type;
    }
    return this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.expression instanceof TypeName) {
      return this.expression.computeType(scope).getSize();
    } else if (this.operator === "&") {
      if (this.expression instanceof VariableIdentifier) {
        var variable = this.expression.variable;
        assert (variable.isStackAllocated);
        return variable.frameOffset();
      } else {
        notImplemented();
      }
    } else if (this.operator === "*") {
      if (this.expression.type.type instanceof StructType) {
        return this.expression.generateCode(null, scope);
      }
      return accessMemory(this.expression.generateCode(null, scope), this.expression.type);
    }
    return this.operator + " " + this.expression.generateCode(null, scope);
  }
};

function PostfixExpression (operator, expression) {
  this.tag = "PostfixExpression";
  this.operator = operator;
  this.expression = expression;
}

PostfixExpression.prototype = {
  computeType: function (scope) {
    this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    return this.expression.generateCode(null, scope) + this.operator;
  }
};

function FunctionCall (name, arguments) {
  this.tag = "FunctionCall";
  this.name = name;
  this.arguments = arguments;
}

FunctionCall.prototype = {
  computeType: function (scope) {
    var type = this.name.computeType(scope);
    var argumentTypes = walkComputeTypes(this.arguments, scope);
    if (type !== types.dyn) {
      assert (type instanceof FunctionType);
      check(this, argumentTypes.length === type.parameterTypes.length, "Argument / parameter mismatch.");
      for (var i = 0; i < this.arguments.length; i++) {
        var aType = argumentTypes[i];
        var pType = type.parameterTypes[i];
        checkTypeAssignment(this, aType, pType);
      }
      return type.returnType;
    }
    return type;
  },
  generateCode: function (writer, scope) {
    // TODO: Apply scoping rules.
    return this.name.generateCode(null, scope) + "(" + walkGenerateCode(this.arguments, null, scope).join(", ") + ")";
  }
};

function VariableIdentifier (name) {
  this.tag = "VariableIdentifier";
  this.name = name;
}

VariableIdentifier.prototype = {
  computeType: function (scope) {
    this.variable = scope.getVariable(this.name, true);
    return this.type = this.variable.type;
  },
  generateCode: function (writer, scope) {
    return this.variable.generateCode();
  }
};

function ExpressionStatement (expression) {
  this.tag = "ExpressionStatement";
  this.expression = expression;
}

ExpressionStatement.prototype = {
  computeType: function (scope) {
    return this.expression.computeType(scope);
  },
  generateCode: function (writer, scope) {
    writer.writeLn(this.expression.generateCode(null, scope) + ";");
  }
};

function AssignmentExpression (operator, left, right) {
  this.tag = "AssignmentExpression";
  this.operator = operator;
  this.left = left;
  this.right = right;
}

function generateMemoryCopy(dst, src, size) {
  return "mc(" + dst + ", " + src + ", " + size + ")";
}

function generateMemoryZero(dst, size) {
  return "mz(" + dst + ", " + size + ")";
}

AssignmentExpression.prototype = {
  computeType: function (scope) {
    var tl = this.leftType = this.left.computeType(scope);
    var tr = this.right.computeType(scope);
    return tl;
  },
  generateCode: function (writer, scope) {
    return generateAssignment(this, scope, this.left, this.operator, this.right, this.leftType);
  }
};

function generateAssignment(scope, node, left, operator, right, type) {
  var l = left.generateCode(null, scope);
  var r = right.generateCode(null, scope);
  if (type instanceof StructType) {
    check(node, operator === null || operator === "=");
    return generateMemoryCopy(l, r, type.getSize());
  }
  return l + " " + operator + " " + r;
}

function log2(x) {
  return Math.log(x) / Math.LN2;
}

function accessMemory(address, type, offset) {
  if (type === types.int) {
    return "I32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  } else if (type === types.uint || type instanceof PointerType) {
    return "U32[" + address + (offset ? " + " + offset : "") + " >> " + log2(type.getSize()) + "]";
  }
  return notImplemented(type);
};

function PropertyAccess (base, accessor) {
  this.tag = "PropertyAccess";
  this.base = base;
  this.accessor = accessor;
}

PropertyAccess.prototype = {
  computeType: function (scope) {
    var type = this.base.computeType(scope);
    if (this.accessor.tag === "expression") {
      this.accessor.expression.computeType(scope);
      if (type instanceof PointerType) {
        return this.type = type.type;
      }
      assert (false);
    } else if (this.accessor.tag === "arrow") {
      check(this, type instanceof PointerType, "Cannot dereference non pointer type.");
      check(this, type.pointers === 0, "Cannot dereference pointers to pointers type.");
      type = type.base;
    } else {
      check(this, !(type instanceof PointerType), "Cannot use . operator on pointer types.");
    }
    if (type instanceof StructType) {
      check(this, type instanceof StructType, "Property access on non structs is not possible.");
      var field = type.getField(this.accessor.name);
      check(this, field, "Field \"" + this.accessor.name + "\" does not exist in type " + type + ".");
      this.field = field;
      return this.type = field.type;
    } else {
      return this.type = types.dyn;
    }
  },
  generateCode: function (writer, scope) {
    if (this.accessor.tag === "arrow") {
      return accessMemory(this.base.generateCode(null, scope), this.field.type, this.field.offset);
    } else if (this.accessor.tag === "dot") {
      if (this.base.type === types.dyn) {
        return this.base.generateCode(null, scope) + "." + this.accessor.name;
      } else {
        return accessMemory(this.base.generateCode(null, scope), this.field.type, this.field.offset);
      }
    }
    throw notImplemented();
  }
};

function NewExpression (constructor, arguments) {
  this.tag = "NewExpression";
  this.constructor = constructor;
  this.arguments = arguments;
}

NewExpression.prototype = {
  computeType: function (scope) {
    var ct = scope.getType(this.constructor.name);
    return this.type = new PointerType(ct);
  },
  generateCode: function (writer, scope) {
    assert (!writer);
    return "ma(" + this.type.type.getSize() + ")";
  }
};

function Block (statements) {
  this.tag = "Block";
  this.statements = statements;
}

Block.prototype = {
  computeType: function (scope) {
    walkComputeTypes(this.statements, scope);
  },
  generateCode: function (writer, scope) {
    walkGenerateCode(this.statements, writer, scope);
  }
};

function WhileStatement (condition, statement, isDoWhile) {
  this.tag = "WhileStatement";
  this.condition = condition;
  this.statement = statement;
  this.isDoWhile = isDoWhile;
}

WhileStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    if (this.isDoWhile) {
      writer.enter("do {");
    } else {
      writer.enter("while (" + this.condition.generateCode(null, scope) + ") {");
    }
    this.statement.generateCode(writer, scope);
    if (this.isDoWhile) {
      writer.leave("} while (" + this.condition.generateCode(null, scope) + ")");
    } else {
      writer.leave("}");
    }
  }
};

function IfStatement (condition, ifStatement, elseStatement) {
  this.tag = "IfStatement";
  this.condition = condition;
  this.ifStatement = ifStatement;
  this.elseStatement = elseStatement;
}

IfStatement.prototype = {
  computeType: function (scope) {
    this.condition.computeType(scope);
    this.ifStatement.computeType(scope);
    if (this.elseStatement) {
      this.elseStatement.computeType(scope);
    }
  },
  generateCode: function (writer, scope) {
    writer.enter("if (" + this.condition.generateCode(null, scope) + ") {");
    this.ifStatement.generateCode(writer, scope);
    if (this.elseStatement) {
      if (this.elseStatement instanceof Block) {
        writer.leaveAndEnter("} else {");
        this.elseStatement.generateCode(writer, scope);
      } else if (this.elseStatement instanceof IfStatement) {
        writer.leaveAndEnter("} else if (" + this.elseStatement.condition.generateCode(null, scope) + ") {");
        this.elseStatement.ifStatement.generateCode(writer, scope);
      }
    }
    writer.leave("}");
  }
};

function ForStatement (initializer, test, counter, statement) {
  this.tag = "ForStatement";
  this.initializer = initializer;
  this.test = test;
  this.counter = counter;
  this.statement = statement;
}

ForStatement.prototype = {
  computeType: function (scope) {
    if (this.initializer) {
      this.initializer.computeType(scope);
    }
    if (this.test) {
      this.test.computeType(scope);
    }
    if (this.counter) {
      this.counter.computeType(scope);
    }
    this.statement.computeType(scope);
  },
  generateCode: function (writer, scope) {
    scope = new Scope(scope, "For");
    var str = "for (";
    str += (this.initializer ? this.initializer.generateCode(null, scope) : "") + ";";
    str += (this.test ? this.test.generateCode(null, scope) : "") + ";";
    str += (this.counter ? this.counter.generateCode(null, scope) : "");
    str += ") {";
    writer.enter(str);
    this.statement.generateCode(writer, scope);
    writer.leave("}");
  }
};


function compile(source, generateExports) {

  var program = parser.parse(source);

//  print (JSON.stringify(program, null, 2));

  program.computeType(types);

//  print (JSON.stringify(program, null, 2));

  var str = "";
  var writer = new IndentingWriter(false, {writeLn: function (x) {
    str += x + "\n";
  }});

  program.generateCode(writer);

  return str;

}


