import React, { useState, useRef, useEffect } from 'react';
import './App.css';

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
  { id: 'esp32-s3-box-3', name: 'ESP32-S3-Box-3', url: 'https://wokwi.com/projects/new/esp32-s3-box-3' },
  { id: 'esp32-m5-core-s3', name: 'ESP32-M5-Core-S3', url: 'https://wokwi.com/projects/new/esp32-m5-core-s3' },
  { id: 'esp32-xiao-c3', name: 'ESP32-XIAO-C3', url: 'https://wokwi.com/projects/new/esp32-xiao-c3' },
  { id: 'esp32-xiao-c6', name: 'ESP32-XIAO-C6', url: 'https://wokwi.com/projects/new/esp32-xiao-c6' },
  { id: 'esp32-xiao-s3', name: 'ESP32-XIAO-S3', url: 'https://wokwi.com/projects/new/esp32-xiao-s3' },
  { id: 'st-nucleo-c031c6', name: 'STM32 Nucleo64 C031C6', url: 'https://wokwi.com/projects/new/st-nucleo-c031c6' },
  { id: 'st-nucleo-l031k6', name: 'STM32 Nucleo64 L031K6', url: 'https://wokwi.com/projects/new/st-nucleo-l031k6' },  
  { id: 'pi-pico', name: 'Raspberry Pi Pico', url: 'https://wokwi.com/projects/new/pi-pico' },
  { id: 'pi-pico-w', name: 'Raspberry Pi Pico W', url: 'https://wokwi.com/projects/new/pi-pico-w' }, 
  { id: 'micropython-pi-pico', name: 'Raspberry Pi Pico (microPython)', url: 'https://wokwi.com/projects/new/micropython-pi-pico' },
  { id: 'microbit', name: 'BBC micro:bit', url: 'https://wokwi.com/projects/new/microbit' }
];

const App: React.FC = () => {
  const [leftWidth, setLeftWidth] = useState(300);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedBoard, setSelectedBoard] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = e.clientX - containerRect.left;
    
    if (newWidth > 100 && newWidth < containerRect.width - 100) {
      setLeftWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="app-container" ref={containerRef}>
      <div 
        className="left-panel" 
        style={{ width: `${leftWidth}px` }}
      >
        <h2>Cartes compatibles Wokwi</h2>
        <div className="board-selector">
          <select 
            value={selectedBoard}
            onChange={(e) => setSelectedBoard(e.target.value)}
            className="board-dropdown"
          >
            <option value="">Sélectionnez une carte</option>
            {WOKWI_BOARDS.map(board => (
              <option key={board.id} value={board.id}>
                {board.name}
              </option>
            ))}
          </select>
        </div>
        {selectedBoard && (
          <div className="board-info">
            <h3>Informations sur la carte</h3>
            <p>ID: {selectedBoard}</p>
            <p>Nom: {WOKWI_BOARDS.find(b => b.id === selectedBoard)?.name}</p>
          </div>
        )}
      </div>
      
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
        style={{ cursor: 'col-resize' }}
      />
      
      <div className="right-panel">
        {selectedBoard ? (
          <iframe
            src={WOKWI_BOARDS.find(b => b.id === selectedBoard)?.url}
            className="wokwi-iframe"
            title="Wokwi Simulator"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="wokwi-placeholder">
            <h2>Configuration</h2>
            <p>Sélectionnez une carte pour lancer le simulateur Wokwi</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App; 