import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import BlocklyEditor from './components/BlocklyEditor';

const WOKWI_BOARDS = [
  { id: 'uno', name: 'Arduino Uno', url: 'https://wokwi.com/projects/new/arduino-uno' },
  { id: 'mega', name: 'Arduino Mega', url: 'https://wokwi.com/projects/new/arduino-mega' },
  { id: 'nano', name: 'Arduino Nano', url: 'https://wokwi.com/projects/new/arduino-nano' },
  { id: 'attiny85', name: 'ATtiny85', url: 'https://wokwi.com/projects/new/attiny85' },
  { id: 'franzininho', name: 'Franzininho', url: 'https://wokwi.com/projects/new/franzininho' },
  { id: 'esp32', name: 'ESP32', url: 'https://wokwi.com/projects/new/esp32' },
  { id: 'esp32-s2', name: 'ESP32-S2', url: 'https://wokwi.com/projects/new/esp32-s2' },
  { id: 'esp32-s3', name: 'ESP32-S3', url: 'https://wokwi.com/projects/new/esp32-s3' },
  { id: 'esp32-c3', name: 'ESP32-C3', url: 'https://wokwi.com/projects/new/esp32-c3' },
  { id: 'esp32-c6', name: 'ESP32-C6', url: 'https://wokwi.com/projects/new/esp32-c6' },
  { id: 'esp32-h2', name: 'ESP32-H2', url: 'https://wokwi.com/projects/new/esp32-h2' },
  { id: 'esp32-s3-box-3', name: 'ESP32-S3-Box-3', url: 'https://wokwi.com/projects/401220633988539393' },
  { id: 'esp32-m5-core-s3', name: 'ESP32-M5-Core-S3', url: 'https://wokwi.com/projects/402847860051798017' },
  { id: 'esp32-xiao-c3', name: 'ESP32-XIAO-C3', url: 'https://wokwi.com/projects/410433244849526785' },
  { id: 'esp32-xiao-c6', name: 'ESP32-XIAO-C6', url: 'https://wokwi.com/projects/411265368570177537' },
  { id: 'esp32-xiao-s3', name: 'ESP32-XIAO-S3', url: 'https://wokwi.com/projects/411276781876475905' },
  { id: 'esp32-2432s028r', name: 'ESP32-2432S028R', url: 'https://wokwi.com/projects/456026462310392833' },
  { id: 'st-nucleo-c031c6', name: 'STM32 Nucleo64 C031C6', url: 'https://wokwi.com/projects/new/st-nucleo-c031c6' },
  { id: 'st-nucleo-l031k6', name: 'STM32 Nucleo64 L031K6', url: 'https://wokwi.com/projects/new/st-nucleo-l031k6' },  
  { id: 'pi-pico', name: 'Raspberry Pi Pico', url: 'https://wokwi.com/projects/new/pi-pico' },
  { id: 'pi-pico-sdk', name: 'Raspberry Pi Pico SDK', url: 'https://wokwi.com/projects/new/pi-pico-sdk' },
  { id: 'pi-pico-w', name: 'Raspberry Pi Pico W', url: 'https://wokwi.com/projects/new/pi-pico-w' },
  { id: 'pi-pico-w-sdk', name: 'Raspberry Pi Pico W SDK', url: 'https://wokwi.com/projects/new/pi-pico-w-sdk' },
  { id: 'micropython-pi-pico', name: 'Raspberry Pi Pico (microPython)', url: 'https://wokwi.com/projects/new/micropython-pi-pico' },
  { id: 'micropython-pi-pico-w', name: 'Raspberry Pi Pico W (microPython)', url: 'https://wokwi.com/projects/new/micropython-pi-pico-w' },
];

const App: React.FC = () => {
  const [localeCode, setLocaleCode] = useState<string>('fr');
  const [localeLabels, setLocaleLabels] = useState<Record<string, string>>({});
  const [selectedBoard, setSelectedBoard] = useState('');
  const [leftWidth, setLeftWidth] = useState(800);
  const [generatedCode, setGeneratedCode] = useState('');
  const [menuMessage, setMenuMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const wokwiIframeRef = useRef<HTMLIFrameElement | null>(null);
  const wokwiWebviewRef = useRef<HTMLElement | null>(null);
  const menuMessageTimerRef = useRef<number | null>(null);
  const isElectron = typeof window !== 'undefined' && typeof (window as any).require === 'function';
  const ipcRenderer = isElectron ? (window as any).require('electron').ipcRenderer : null;
  const text = (key: string, frFallback: string, enFallback: string) => {
    const explicit = localeLabels[key];
    if (typeof explicit === 'string' && explicit.trim()) return explicit;
    return localeCode.startsWith('en') ? enFallback : frFallback;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    setIsDragging(true);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    
    if (newWidth > 100 && newWidth < containerRect.width - 100) {
      setLeftWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  };

  const showTemporaryMessage = (message: string) => {
    if (typeof message !== 'string' || !message.trim()) return;
    setMenuMessage(message);
    if (menuMessageTimerRef.current !== null) {
      window.clearTimeout(menuMessageTimerRef.current);
    }
    menuMessageTimerRef.current = window.setTimeout(() => {
      setMenuMessage('');
    }, 3500);
  };

  const handleUploadClick = async () => {
    if (isUploading) return;
    if (!selectedBoard) {
      showTemporaryMessage(text('selectBoardFirst', 'Selectionnez une carte avant de televerser.', 'Select a board before upload.'));
      return;
    }
    if (!generatedCode.trim()) {
      showTemporaryMessage(text('noCodeToUpload', 'Aucun code a televerser.', 'No code to upload.'));
      return;
    }

    setIsUploading(true);
    try {
      if (ipcRenderer) {
        const ok = await ipcRenderer.invoke('inject-code-wokwi', generatedCode);
        showTemporaryMessage(
          ok
            ? text('uploadOkRenderer', 'Code televerse dans la carte Wokwi.', 'Code uploaded to the Wokwi board.')
            : text(
                'uploadProjectMissing',
                'Echec du televersement: ouvrez d abord un projet Wokwi.',
                'Upload failed: open a Wokwi project first.'
              )
        );
      } else if (wokwiIframeRef.current?.contentWindow) {
        wokwiIframeRef.current.contentWindow.postMessage({ type: 'updateCode', code: generatedCode }, '*');
        showTemporaryMessage(text('uploadRequestSent', 'Demande de televersement envoyee.', 'Upload request sent.'));
      } else {
        showTemporaryMessage(text('noWokwiWindow', 'Aucune fenetre Wokwi disponible.', 'No Wokwi window available.'));
      }
    } catch (_error) {
      showTemporaryMessage(text('uploadFailed', 'Echec du televersement du code.', 'Code upload failed.'));
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (ipcRenderer) {
      ipcRenderer.send('generated-code-updated', generatedCode);
      if (!generatedCode) return;
      ipcRenderer.invoke('inject-code-wokwi', generatedCode).catch(() => {});
    } else if (wokwiIframeRef.current?.contentWindow) {
      if (!generatedCode) return;
      wokwiIframeRef.current.contentWindow.postMessage({ type: 'updateCode', code: generatedCode }, '*');
    }
  }, [generatedCode, ipcRenderer]);

  useEffect(() => {
    if (!ipcRenderer) return;

    const handleMenuNotification = (_event: unknown, message: string) => {
      if (typeof message !== 'string' || !message.trim()) return;
      setMenuMessage(message);

      if (menuMessageTimerRef.current !== null) {
        window.clearTimeout(menuMessageTimerRef.current);
      }
      menuMessageTimerRef.current = window.setTimeout(() => {
        setMenuMessage('');
      }, 3500);
    };

    ipcRenderer.on('menu-notification', handleMenuNotification);
    return () => {
      if (menuMessageTimerRef.current !== null) {
        window.clearTimeout(menuMessageTimerRef.current);
      }
      ipcRenderer.removeListener('menu-notification', handleMenuNotification);
    };
  }, [ipcRenderer]);

  useEffect(() => {
    if (!ipcRenderer) {
      const browserLang =
        typeof navigator !== 'undefined' && typeof navigator.language === 'string'
          ? navigator.language.toLowerCase()
          : 'fr';
      setLocaleCode(browserLang.split(/[-_]/)[0] || 'fr');
      return;
    }

    const applyLocalePayload = (payload: unknown) => {
      if (!payload || typeof payload !== 'object') return;
      const candidate = payload as { code?: unknown; labels?: unknown; ucBlocklyLang?: unknown };
      if (typeof candidate.code === 'string' && candidate.code.trim()) {
        setLocaleCode(candidate.code.trim().toLowerCase());
      }
      if (candidate.labels && typeof candidate.labels === 'object') {
        setLocaleLabels(candidate.labels as Record<string, string>);
      }
      if (typeof candidate.ucBlocklyLang === 'string' && candidate.ucBlocklyLang.trim()) {
        setLocaleCode(candidate.ucBlocklyLang.trim().toLowerCase());
      }
    };

    let disposed = false;
    ipcRenderer
      .invoke('get-current-locale-data')
      .then((payload: unknown) => {
        if (disposed) return;
        applyLocalePayload(payload);
      })
      .catch(() => {
        if (!disposed) setLocaleCode('fr');
      });

    const handleLocaleChanged = (_event: unknown, payload: unknown) => {
      applyLocalePayload(payload);
    };
    ipcRenderer.on('locale-changed', handleLocaleChanged);

    return () => {
      disposed = true;
      ipcRenderer.removeListener('locale-changed', handleLocaleChanged);
    };
  }, [ipcRenderer]);

  return (
    <div className={`app-container${isDragging ? ' dragging' : ''}`} ref={containerRef}>
      <div 
        className="left-panel" 
        style={{ width: `${leftWidth}px` }}
      >
        <div className="board-selector">
          <select 
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
            className="board-dropdown"
          >
            <option value="">{text('selectBoard', 'Selectionnez une carte', 'Select a board')}</option>
            {WOKWI_BOARDS.map(board => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="upload-button"
            onClick={() => {
              void handleUploadClick();
            }}
            disabled={isUploading || !selectedBoard}
            title={
              !selectedBoard
                ? text('selectBoard', 'Selectionnez une carte', 'Select a board')
                : text('uploadTooltip', 'Televerser le code dans la carte', 'Upload code to board')
            }
          >
            {isUploading
              ? text('uploading', 'Televersement...', 'Uploading...')
              : text('uploadButton', 'Televerser', 'Upload')}
          </button>
        </div>
        <div className="ucblockly-container">
          <BlocklyEditor
            selectedBoard={selectedBoard}
            onCodeChange={setGeneratedCode}
            localeCode={localeCode}
          />
        </div>
      </div>
      
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'col-resize' }}
      />
      
      <div className="right-panel">
        {selectedBoard ? (
          isElectron ? (
            <webview
              ref={wokwiWebviewRef as any}
              src={WOKWI_BOARDS.find(b => b.id === selectedBoard)?.url}
              className="wokwi-iframe"
              style={{ width: '100%', height: '100%', border: 'none' }}
              allowpopups
            />
          ) : (
            <iframe
              ref={wokwiIframeRef}
              src={WOKWI_BOARDS.find(b => b.id === selectedBoard)?.url}
              className="wokwi-iframe"
              title="Wokwi Simulator"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )
        ) : (
          <div className="wokwi-placeholder">
            <h2>{text('placeholderTitle', 'Configuration', 'Configuration')}</h2>
            <p>
              {text(
                'placeholderDesc',
                'Selectionnez une carte pour lancer le simulateur Wokwi',
                'Select a board to launch the Wokwi simulator'
              )}
            </p>
          </div>
        )}
      </div>
      {menuMessage ? <div className="menu-feedback">{menuMessage}</div> : null}
    </div>
  );
};

export default App; 