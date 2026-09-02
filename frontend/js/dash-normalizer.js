/* Normalize long dash characters across all visible SevaHub UI text.
   Converts em dash (—) and en dash (–) to a normal hyphen (-).
   This also covers dynamically rendered AI, support, booking and admin text. */
(function(){
  const LONG_DASH=/[—–]/g;
  const SKIP_SELECTOR='script,style,noscript,code,pre';
  const ATTRS=['placeholder','title','aria-label','alt'];

  function normalize(value){
    return typeof value==='string' ? value.replace(LONG_DASH,'-') : value;
  }

  function normalizeTextNode(node){
    if(!node||node.nodeType!==Node.TEXT_NODE)return;
    const parent=node.parentElement;
    if(parent&&parent.closest(SKIP_SELECTOR))return;
    const next=normalize(node.nodeValue);
    if(next!==node.nodeValue)node.nodeValue=next;
  }

  function normalizeElement(el){
    if(!el||el.nodeType!==Node.ELEMENT_NODE||el.matches(SKIP_SELECTOR))return;
    ATTRS.forEach(attr=>{
      if(!el.hasAttribute(attr))return;
      const current=el.getAttribute(attr);
      const next=normalize(current);
      if(next!==current)el.setAttribute(attr,next);
    });
  }

  function normalizeTree(root){
    if(!root)return;
    if(root.nodeType===Node.TEXT_NODE){
      normalizeTextNode(root);
      return;
    }
    if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;

    if(root.nodeType===Node.ELEMENT_NODE)normalizeElement(root);

    const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())){
      if(node.nodeType===Node.TEXT_NODE)normalizeTextNode(node);
      else normalizeElement(node);
    }
  }

  function normalizeDocumentTitle(){
    const next=normalize(document.title);
    if(next!==document.title)document.title=next;
  }

  normalizeDocumentTitle();
  normalizeTree(document.documentElement);

  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      if(mutation.type==='characterData'){
        normalizeTextNode(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach(normalizeTree);
    }
    normalizeDocumentTitle();
  });

  observer.observe(document.documentElement,{
    childList:true,
    subtree:true,
    characterData:true
  });

  window.sevahubNormalizeDashes=()=>{
    normalizeDocumentTitle();
    normalizeTree(document.documentElement);
  };
})();
