// qz-tray não publica tipos próprios — a lib é usada de forma bem dinâmica
// (config genérica, retorno de impressora pode ser string ou array), então
// tipar frouxo aqui é proposital, não preguiça.
declare module 'qz-tray' {
  const qz: any
  export default qz
}
