declare module '*.png' {
  const source: string;
  export default source;
}

declare module '*.scss' {
  const classes: Record<string, string>;
  export default classes;
}
