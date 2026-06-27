export function patchPlayerChunk(source) {
  return source
    .replace(/=o\(7358\)/g, '=void 0')
    .replace(/o\(7358\);/g, 'void 0;')
    .replace('if(!i3())return!1', 'if(!1)return!1')
    .replace('if(!i7())return', 'if(!1)return')
    .replace(
      'if(W in ic)t=ic[W];else if(W in id)t=id[W];else throw ReferenceError(W+iW(3047,"bEAY"))',
      'if(W in ic)t=ic[W];else if(W in id)t=id[W];else if(typeof globalThis!=="undefined"&&W in globalThis)t=globalThis[W];else throw ReferenceError("missing:"+W)',
    )
    .replace(
      '.join("")}k_.from("xZ/aW~D6:U0_]EVA");',
      '.join("")}globalThis.__playerEncode=k2;k_.from("xZ/aW~D6:U0_]EVA");',
    )
    .replace(
      'ic[k7(2877)]=iM,globalThis._0x21ffa5=ic._0x21ffa5',
      'ic[k7(2877)]=iM,globalThis.__playerInit=iM,globalThis._0x21ffa5=ic._0x21ffa5',
    )
    .replace(
      'ic[k9(1643,"J&Yt")]=iU,globalThis._0x430e19=ic._0x430e19',
      'ic[k9(1643,"J&Yt")]=iU,globalThis.__playerDecrypt=iU,globalThis._0x430e19=ic._0x430e19',
    )
    .replace(
      'let k4=i8,k5=i8,k3=i8,k7=i8,k6=i8,k9=ik,iW=ik,it=ik,io=ik,ie=ik;',
      'let k4=i8,k5=i8,k3=i8,k7=i8,k6=i8,k9=ik,iW=ik,it=ik,io=ik,ie=ik;globalThis.__playerDecodeUnsalted=k4,globalThis.__playerDecodeSalted=it;',
    )
}

function nativeFn(name, impl, length = 0, { anonymous = false } = {}) {
  const fn = function () {
    return impl.apply(this, arguments)
  }
  Object.defineProperty(fn, 'name', { value: anonymous ? '' : name, configurable: true })
  Object.defineProperty(fn, 'length', { value: length, configurable: true })
  fn.toString = () =>
    anonymous ? 'function () { [native code] }' : `function ${name}() { [native code] }`
  return fn
}

export function createNativeConsole(base = console) {
  const nativeLog = nativeFn('log', () => {}, 1)
  const table = nativeFn('table', () => {}, 1)
  const clear = nativeFn('clear', () => {}, 0)
  return new Proxy(base, {
    get(target, prop) {
      if (prop === 'log') return nativeLog
      if (prop === 'table') return table
      if (prop === 'clear') return clear
      return target[prop]
    },
  })
}
