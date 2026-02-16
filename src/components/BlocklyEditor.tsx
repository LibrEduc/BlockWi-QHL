import React, { useRef, useEffect } from 'react';

const UCBLOCKLY_LOCAL_URL =
  typeof window !== 'undefined' && window.location.protocol === 'file:'
    ? './ucblockly/index.html'
    : '/ucblockly/index.html';

interface BlocklyEditorProps {
  selectedBoard: string;
  onCodeChange: (code: string) => void;
  localeCode: string;
}

/**
 * Intégration µcBlockly (https://github.com/A-S-T-U-C-E/ucBlockly)
 * Chargé en iframe depuis notre copie locale (public/ucblockly/) qui observe
 * div_content_code et envoie le code au parent via postMessage.
 * Le parent transmet le code à l’iframe Wokwi (Monaco).
 */
const BlocklyEditor: React.FC<BlocklyEditorProps> = ({ onCodeChange, localeCode }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const isElectron = typeof window !== 'undefined' && typeof (window as any).require === 'function';
  const ipcRenderer = isElectron ? (window as any).require('electron').ipcRenderer : null;
  const lang = (typeof localeCode === 'string' && localeCode.trim()
    ? localeCode.trim().toLowerCase().slice(0, 2)
    : 'fr');
  const defaultUrl = `${UCBLOCKLY_LOCAL_URL}?lang=${lang}`;
  const [ucBlocklyUrl, setUcBlocklyUrl] = React.useState(isElectron ? 'about:blank' : defaultUrl);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ucblockly-code' && typeof event.data.code === 'string') {
        onCodeChange(event.data.code);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCodeChange]);

  useEffect(() => {
    if (!ipcRenderer) {
      setUcBlocklyUrl(defaultUrl);
      return;
    }
    setUcBlocklyUrl('about:blank');
    if (!ipcRenderer) return;
    ipcRenderer
      .invoke('get-ucblockly-url', lang)
      .then((resolvedUrl: unknown) => {
        if (typeof resolvedUrl === 'string' && resolvedUrl.trim()) {
          setUcBlocklyUrl(resolvedUrl);
        }
      })
      .catch(() => {});
  }, [defaultUrl, ipcRenderer, lang]);

  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        backgroundColor: '#fff',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <iframe
        ref={iframeRef}
        src={ucBlocklyUrl}
        title="µcBlockly - Programmation visuelle microcontrôleurs"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
      />
    </div>
  );
};

export default BlocklyEditor;
