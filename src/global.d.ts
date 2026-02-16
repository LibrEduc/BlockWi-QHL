/** Tag webview d'Electron pour intégration Wokwi (inspiré Tinkercad) */
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLElement> & { src?: string; allowpopups?: boolean },
      HTMLElement
    >;
  }
}
