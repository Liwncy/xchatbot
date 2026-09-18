import fs from 'fs';

const src = fs.readFileSync('node_modules/silk-wasm/lib/index.mjs', 'utf8');
if ((src.match(/new Function/g) || []).length !== 2) {
  throw new Error('unexpected new Function count');
}

const helpers = `function embindInvoker(cppInvoker, cppFn, runDestructors, argTypes, usesThis, usesDestructors, returnsValue) {
  const expectedArgCount = argTypes.length - 2;
  return function (...args) {
    const destructors = [];
    const invokerFuncArgs = [cppFn];
    let thisWired;
    const argsWired = [];
    if (usesThis) {
      thisWired = argTypes[1].toWireType(usesDestructors ? destructors : null, this);
      invokerFuncArgs.push(thisWired);
    }
    for (let i = 0; i < expectedArgCount; i++) {
      const wired = argTypes[i + 2].toWireType(usesDestructors ? destructors : null, args[i]);
      argsWired.push(wired);
      invokerFuncArgs.push(wired);
    }
    const rv = cppInvoker(...invokerFuncArgs);
    if (usesDestructors) runDestructors(destructors);
    else {
      for (let i = usesThis ? 1 : 2; i < argTypes.length; i++) {
        const param = i === 1 ? thisWired : argsWired[i - 2];
        if (argTypes[i].G != null) argTypes[i].G(param);
      }
    }
    if (returnsValue) return argTypes[0].fromWireType(rv);
  };
}
function emvalCaller(retType, argTypes, callMode, emvalReturnValue) {
  return function (obj, func, destructorsRef, args) {
    let offset = 0;
    const callArgs = [];
    for (let i = 0; i < argTypes.length; i++) {
      callArgs.push(argTypes[i].readValueFromPointer(args + offset));
      offset += argTypes[i].H;
    }
    const rv = callMode === 1 ? new func(...callArgs) : func.call(obj, ...callArgs);
    if (!retType.L) return emvalReturnValue(retType, destructorsRef, rv);
  };
}
`;

let out = src.replace(
  'let[yb,zb]=[oa,r+`}\n`];if(k=new Function(...yb,zb)(...z),',
  'if(k=embindInvoker(e,f,Oa,k,false,M,Qa),',
);
out = out.replace(
  'a=new Function(...h,e+`};\n`)(...l),',
  'a=emvalCaller(c,b,d,sb),',
);
out = out.replace(
  'async function encode(input,sampleRate){let instance=await silk_default(),',
  'let silkReady;async function getSilkInstance(){return silkReady ??= silk_default()}async function encode(input,sampleRate){let instance=await getSilkInstance(),',
);
if (out.includes('new Function')) {
  throw new Error('new Function still present');
}
if (!out.includes('embindInvoker(e,f,Oa,k,false,M,Qa)')) {
  throw new Error('first patch missed');
}
if (!out.includes('emvalCaller(c,b,d,sb)')) {
  throw new Error('second patch missed');
}

fs.mkdirSync('src/utils/silk/vendor', {recursive: true});
fs.writeFileSync('src/utils/silk/vendor/silk-glue.mjs', helpers + out);
console.log('ok', helpers.length + out.length);
