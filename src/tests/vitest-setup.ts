import { logger } from '../utils/logger';
/**
 * Vitest测试环境配置
 *
 * 提供全局测试工具和DOM匹配器
 */

import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.useRealTimers();
  const testWindow = window as TestWindow & {
    __weaveThemeManagerCleanup?: (() => void) | null;
  };
  testWindow.__weaveThemeManagerCleanup?.();
});

type TestWindow = Window &
  typeof globalThis & {
    app?: Record<string, unknown>;
    __weaveThemeManagerCleanup?: (() => void) | null;
  };

// 全局测试工具
Object.defineProperty(globalThis, 'vi', {
  configurable: true,
  value: vi,
  writable: true
});

function installObsidianPopoutGlobals(): void {
  if (typeof document !== "undefined" && !("activeDocument" in globalThis)) {
    Object.defineProperty(globalThis, "activeDocument", {
      configurable: true,
      get: () => document,
    });
  }
  if (typeof window !== "undefined" && !("activeWindow" in globalThis)) {
    Object.defineProperty(globalThis, "activeWindow", {
      configurable: true,
      get: () => window,
    });
    const testWindow = window as TestWindow & {
      activeDocument?: Document;
      activeWindow?: Window;
    };
    if (!testWindow.activeDocument) {
      Object.defineProperty(testWindow, "activeDocument", {
        configurable: true,
        get: () => document,
      });
    }
    if (!testWindow.activeWindow) {
      Object.defineProperty(testWindow, "activeWindow", {
        configurable: true,
        get: () => window,
      });
    }
  }

  if (typeof Node !== "undefined" && !("instanceOf" in Node.prototype)) {
    Object.defineProperty(Node.prototype, "instanceOf", {
      configurable: true,
      value<T>(this: Node, type: { new (): T }): this is T {
        return this instanceof type;
      },
    });
  }
}

installObsidianPopoutGlobals();

// Mock Obsidian全局对象（如果需要）
if (typeof window !== 'undefined') {
  // 确保测试环境中有基本的window对象
  const testWindow = window as TestWindow;
  testWindow.app ??= {};

  if (typeof testWindow.matchMedia !== 'function') {
    Object.defineProperty(testWindow, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => false),
      })),
    });
  }
}

logger.debug('✓ Vitest测试环境已初始化');
