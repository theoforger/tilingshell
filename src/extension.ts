import './styles/stylesheet.scss';

import { Settings } from '@gi-types/gio2';
import { Indicator } from '@/indicator/indicator';
import { logger } from '@/utils/shell';
import { Main, addToStatusArea, getMonitors } from '@/utils/ui';
import { getCurrentExtension, getCurrentExtensionSettings } from '@/utils/shell';
import { TilingManager } from "@/components/tilingManager";
import { Margin } from "@gi-types/clutter10";
import { LayoutsUtils } from './components/layout/LayoutUtils';
import { TileGroup } from './components/tileGroup';
import { Rectangle } from '@gi-types/meta10';

const SIGNAL_WORKAREAS_CHANGED = 'workareas-changed';
const debug = logger('extension');

class Extension {
  private settings: Settings;
  private isEnabled = false;
  private indicator: Indicator | null;
  private tilingManagers: TilingManager[];
  private margins: Margin = new Margin({top: 16, left: 16, right: 16, bottom: 16});

  private _signalWorkareaChangedId: number | null = null;

  constructor() {
    this.settings = getCurrentExtensionSettings();
    debug('extension is initialized');
  }

  createIndicator(availableLayouts: TileGroup[], selectedLayoutIndex: number) {
    if (this.settings.get_boolean('show-indicator')) {
      this.indicator = new Indicator((lay) => this.onLayoutSelected(lay));
      addToStatusArea(this.indicator);
    
      const hasMargins = this.margins.top > 0 || this.margins.bottom > 0 || this.margins.left > 0 || this.margins.right > 0;
      this.indicator?.setLayouts(availableLayouts, selectedLayoutIndex, hasMargins);
    }
  }

  enable(): void {
    this.isEnabled = true;
    // for this version we have a custom layout plus three fixed ones
    const availableLayouts = [
      LayoutsUtils.LoadLayouts(),
      new TileGroup({
        tiles: [
            new TileGroup({ perc: 0.22 }),
            new TileGroup({ perc: 0.56 }),
            new TileGroup({ perc: 0.22 }),
        ],
      }), 
      new TileGroup({
        tiles: [
            new TileGroup({ perc: 0.33 }),
            new TileGroup({ perc: 0.67 }),
        ],
      }), 
      new TileGroup({
        tiles: [
            new TileGroup({ perc: 0.67 }),
            new TileGroup({ perc: 0.33 }),
        ],
      })
    ];

    this.createIndicator(availableLayouts, 0);

    if (this.tilingManagers = []) {
      debug('building a tiling manager for each monitor');
      this.tilingManagers = getMonitors().map(monitor => new TilingManager(monitor, availableLayouts, 0, this.margins));
    }

    this.tilingManagers.forEach(tm => tm.enable());

    this._signalWorkareaChangedId = global.display.connect(SIGNAL_WORKAREAS_CHANGED, () => {
      const allMonitors = getMonitors();
      if (this.tilingManagers.length !== allMonitors.length) {
        // a monitor was disconnected or a new one was connected
        this.tilingManagers.forEach(tm => tm.destroy());
        this.tilingManagers = allMonitors.map(monitor => new TilingManager(monitor, availableLayouts, 0, this.margins));
        this.tilingManagers.forEach(tm => tm.enable());
        const selectedLayoutIndex = this.indicator?.getSelectedButtonIndex() || 0;
        this.indicator?.destroy();
        this.createIndicator(availableLayouts, selectedLayoutIndex);
      } else {
        allMonitors.forEach(monitor => {
          const newWorkArea: Rectangle = Main.layoutManager.getWorkAreaForMonitor(monitor.index);
          this.tilingManagers[monitor.index].workArea = newWorkArea;
        });
      }
    });

    debug('extension is enabled');
  }

  disable(): void {
    this.indicator?.destroy();
    this.indicator = null;
    this.tilingManagers.forEach(tm => tm.destroy());
    this.tilingManagers = [];
    this.isEnabled = false;
    if (this._signalWorkareaChangedId) global.display.disconnect(this._signalWorkareaChangedId);
    debug('extension is disabled');
  }

  onLayoutSelected(layout: TileGroup) {
    this.tilingManagers.forEach(tm => tm.setActiveLayout(layout));
  }
}

export default function (): Extension {
  imports.misc.extensionUtils.initTranslations(getCurrentExtension().metadata.uuid);
  return new Extension();
}
