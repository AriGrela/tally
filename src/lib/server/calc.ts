// Tiny recursive-descent calculator. No eval, no identifiers beyond a fixed list.

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: Math.floor,
  ceil: Math.ceil,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  exp: Math.exp,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expression: string): number {
  const src = expression.replace(/×/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^");
  let i = 0;

  const peek = () => {
    while (src[i] === " ") i++;
    return src[i];
  };
  const eat = (c: string) => {
    if (peek() === c) {
      i++;
      return true;
    }
    return false;
  };
  const fail = (msg: string): never => {
    throw new Error(`${msg} at position ${i + 1} in "${expression}"`);
  };

  function expr(): number {
    let v = term();
    for (;;) {
      if (eat("+")) v += term();
      else if (eat("-")) v -= term();
      else return v;
    }
  }
  function term(): number {
    let v = unary();
    for (;;) {
      if (eat("*")) v *= unary();
      else if (eat("/")) {
        const d = unary();
        if (d === 0) fail("Division by zero");
        v /= d;
      } else if (eat("%")) v %= unary();
      else return v;
    }
  }
  function unary(): number {
    if (eat("-")) return -unary();
    if (eat("+")) return unary();
    return power();
  }
  function power(): number {
    const base = atom();
    if (eat("^")) return base ** unary();
    return base;
  }
  function atom(): number {
    const c = peek();
    if (c === "(") {
      i++;
      const v = expr();
      if (!eat(")")) fail("Missing )");
      return v;
    }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return parseFloat(num[0]);
    }
    const id = /^[a-z_][a-z0-9_]*/i.exec(src.slice(i));
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      if (name in CONSTS) return CONSTS[name];
      const fn = FUNCS[name];
      if (!fn) fail(`Unknown name "${name}"`);
      if (!eat("(")) fail(`Expected ( after ${name}`);
      const args: number[] = [];
      if (!eat(")")) {
        do args.push(expr());
        while (eat(","));
        if (!eat(")")) fail("Missing )");
      }
      return fn(...args);
    }
    return fail("Unexpected input");
  }

  const value = expr();
  if (peek() !== undefined) fail("Unexpected input");
  if (!Number.isFinite(value)) throw new Error("Result is not a finite number");
  return value;
}
