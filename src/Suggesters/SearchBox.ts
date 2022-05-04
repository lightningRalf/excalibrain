import { TFile } from "obsidian";
import ExcaliBrain from "src/main";
import { Scene } from "src/Scene";
import { FileSuggest } from "./FileSuggester";

export class SearchBox {
  private wrapperDiv: HTMLDivElement;

  constructor(
    private contentEl: HTMLElement,
    private plugin: ExcaliBrain
  ) {
    contentEl.addClass("excalibrain-contentEl");
    this.wrapperDiv = this.contentEl.createDiv();
    this.wrapperDiv.addClass("excalibrain-search-wrapper");
    const inputEl = this.wrapperDiv.createEl("input",{type: "text"});
    inputEl.style.width = "400px";

    inputEl.oninput = () => {
      const file = app.vault.getAbstractFileByPath(inputEl.value);
      if(file && file instanceof TFile) {
        this.plugin.scene?.renderGraphForFile(inputEl.value);
        inputEl.value = file.basename;
      }
    }

    new FileSuggest(
      this.plugin.app,
      inputEl,
      this.plugin
    );
    this.contentEl.appendChild(this.wrapperDiv);

  }

  terminate() {
    if(this.wrapperDiv) {
      try{
        this.contentEl?.removeChild(this.wrapperDiv);
      } catch{}
      this.wrapperDiv = null;
    }
  }
}