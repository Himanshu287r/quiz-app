declare module 'jspdf' {
  export class jsPDF {
    constructor(...args: any[]);
    setFontSize(size: number): void;
    text(text: string, x: number, y: number): void;
    addPage(): void;
    save(filename: string): void;
  }
}