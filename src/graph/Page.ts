import { TFile } from "obsidian";
import ExcaliBrain from "src/main";
import { ExcaliBrainSettings } from "src/Settings";
import { Neighbour, Relation, RelationType } from "src/Types";
import { pipeline } from "stream";



const DEFAULT_RELATION:Relation = {
  target: null,
  isParent: false,
  isChild: false,
  isFriend: false
}

const getRelationVector = (r:Relation):{
  pi: boolean,
  pd: boolean,
  ci: boolean,
  cd: boolean,
  fd: boolean
} => {
  return {
    pi: r.isParent && r.parentType === RelationType.INFERRED,
    pd: r.isParent && r.parentType === RelationType.DEFINED,
    ci: r.isChild && r.childType === RelationType.INFERRED,
    cd: r.isChild && r.childType === RelationType.DEFINED,
    fd: r.isFriend
  }
}

const concat = (s1: string, s2: string): string => {
  return s1 && s2 
    ? (s1 +", " + s2)
    : s1 
      ? s1
      : s2
}

const relationTypeToSet = (currentType: RelationType, newType: RelationType):RelationType => {
  if(currentType === RelationType.DEFINED) {
    return RelationType.DEFINED
  }
  if(currentType === RelationType.INFERRED) {
    if(newType === RelationType.DEFINED) {
      return RelationType.DEFINED;
    }
    return RelationType.INFERRED;
  }
  return newType;
}

export class Page {
  public mtime: number;
  public path: string;
  public file: TFile;
  public neighbours: Map<string,Relation>;
  public plugin: ExcaliBrain;
  public settings: ExcaliBrainSettings;
  public dvPage: Record<string, any>;
  
  constructor(path:string, file:TFile, plugin: ExcaliBrain) {
    this.path = path;
    this.file = file;
    this.mtime = file ? file.stat.mtime : null;
    this.neighbours = new Map<string,Relation>();
    this.plugin = plugin;
    this.settings = plugin.settings;
  }

  private getNeighbours(): [string, Relation][] {
    const { showVirtualNodes, showAttachments, showInferredNodes } = this.settings
    return Array.from(this.neighbours)
      .filter(x=> (showVirtualNodes || !x[1].target.isVirtual) && 
        (showAttachments || !x[1].target.isAttachment))
  }
  
  public get isVirtual(): boolean {
    return this.file === null;
  }

  public get isAttachment(): boolean {
    return this.file ? (this.file.extension !== "md") : false;
  }

  public get isMarkdown(): boolean {
    //files that have not been created are assumed to be markdown files
    return this.file?.extension === "md" || !this.file;
  }

  //-----------------------------------------------
  // add relationships
  //-----------------------------------------------
  addParent(page: Page, relationType:RelationType, definition?: string) {
    if(page.path === this.plugin.settings.excalibrainFilepath) {
      return;
    };
    const neighbour = this.neighbours.get(page.path);
    if(neighbour) {
      neighbour.isParent = true;
      neighbour.parentType = relationTypeToSet(neighbour.parentType,relationType);
      neighbour.parentTypeDefinition = concat(definition, neighbour.parentTypeDefinition);
      return;
    }
    this.neighbours.set(page.path, {
      ...DEFAULT_RELATION,
      target: page,
      isParent: true,
      parentType: relationType,
      parentTypeDefinition: definition,
    });
  }

  addChild(page: Page, relationType:RelationType, definition?: string) {
    if(page.path === this.plugin.settings.excalibrainFilepath) {
      return;
    };
    const neighbour = this.neighbours.get(page.path);
    if(neighbour) {
      neighbour.isChild = true;
      neighbour.childType = relationTypeToSet(neighbour.childType,relationType);
      neighbour.childTypeDefinition = concat(definition,neighbour.childTypeDefinition);
      return;
    }
    this.neighbours.set(page.path, {
      ...DEFAULT_RELATION,
      target: page,
      isChild: true,
      childType: relationType,
      childTypeDefinition: definition,
    });
  }

  addFriend(page: Page, relationType:RelationType, definition?: string) {
    if(page.path === this.plugin.settings.excalibrainFilepath) {
      return;
    };
    const neighbour = this.neighbours.get(page.path);
    if(neighbour) {
      neighbour.isFriend = true;
      neighbour.friendType = relationTypeToSet(neighbour.friendType,relationType);
      neighbour.friendTypeDefinition = concat(definition,neighbour.friendTypeDefinition);;
      return;
    }
    this.neighbours.set(page.path, {
      ...DEFAULT_RELATION,
      target: page,
      isFriend: true,
      friendType: relationType,
      friendTypeDefinition: definition,
    });
  }
  
  unlinkNeighbour(pagePath: string) {
    this.neighbours.delete(pagePath);
  }

  //-----------------------------------------------
  //see: getRelationLogic.excalidraw
  //-----------------------------------------------
  isChild = (relation: Relation):RelationType => {
    const {pi,pd,ci,cd,fd} = getRelationVector(relation);
    return (cd && !pd && !fd) 
      ? RelationType.DEFINED 
      : (!pi && !pd && ci && !cd && !fd)
        ? RelationType.INFERRED
        : null;
  };

  hasChildren ():boolean {
    return this.getNeighbours()
    .some(x => {
      const rt = this.isChild(x[1]);
      return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
    });
  }

  getChildren():Neighbour[] {
    return this.getNeighbours()
      .filter(x => {
        const rt = this.isChild(x[1]);
        return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
      }).map(x=>{
        return {
          page: x[1].target,
          relationType: x[1].childType,
          typeDefinition: x[1].childTypeDefinition
        }
      });//.sort
  }

  isParent (relation: Relation):RelationType {
    const {pi,pd,ci,cd,fd} = getRelationVector(relation);
    return (!cd && pd && !fd) 
      ? RelationType.DEFINED 
      : (pi && !pd && !ci && !cd && !fd)
        ? RelationType.INFERRED
        : null;
  }
  

  hasParents():boolean { 
    return this.getNeighbours()
    .some(x => {
      const rt = this.isParent(x[1]);
      return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
    });
  }

  getParents():Neighbour[] {
    return this.getNeighbours()
    .filter(x => {
      const rt = this.isParent(x[1]);
      return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
    })
    .map(x => {
      return {
        page: x[1].target,
        relationType: x[1].parentType,
        typeDefinition: x[1].parentTypeDefinition
      }
    });//.sort
  }

  isFriend (relation: Relation):RelationType {
    const {pi,pd,ci,cd,fd} = getRelationVector(relation);
    return fd 
      ? RelationType.DEFINED 
      : (pi && !pd && ci && !cd && !fd)
        ? RelationType.INFERRED
        : null;
  }
    

  hasFriends():boolean {
    return this.getNeighbours()
    .some(x => {
      const rt = this.isFriend(x[1]);
      return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
    })
  }

  getFriends():Neighbour[] {
    return this.getNeighbours()
    .filter(x => {
      const rt = this.isFriend(x[1]);
      return (rt && this.settings.showInferredNodes) || (rt === RelationType.DEFINED);
    })
    .map(x => {
      return {
        page: x[1].target,
        relationType: x[1].friendType ??
          (x[1].parentType === RelationType.DEFINED && x[1].childType === RelationType.DEFINED)
          //case H
          ? RelationType.DEFINED
          //case I
          : RelationType.INFERRED,
        typeDefinition: x[1].friendTypeDefinition
      }
    });//.sort
  }
  

  getRelationToPage(otherPage:Page):null|{
    type: "friend" | "parent" | "child",
    relationType: RelationType;
    typeDefinition: string,
  } {
    const relation = this.neighbours.get(otherPage.path)
    if(!relation) {
      return null;
    }
    if(this.isChild(relation)) {
      return {
        type: "child",
        relationType: relation.childType,
        typeDefinition: relation.childTypeDefinition
      }
    }
    if(this.isParent(relation)) {
      return {
        type: "parent",
        relationType: relation.parentType,
        typeDefinition: relation.parentTypeDefinition
      }
    }
    else return {
      type: "friend",
      relationType: relation.friendType,
      typeDefinition: relation.friendTypeDefinition
    }
  }

  getSiblings():Neighbour[] {
    const siblings = new Map<string,Neighbour>();
    this.getParents().forEach(p => 
      p.page.getChildren().forEach(s => {
        if(siblings.has(s.page.path)) {
          if(s.relationType === RelationType.DEFINED) {
            siblings.get(s.page.path).relationType = RelationType.DEFINED;
          }
          return;
        }
        siblings.set(s.page.path,s);
      })
    );
    return Array.from(siblings.values());
  }
}