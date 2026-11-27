let renderIcon;
export function setRenderedIcons(getIcon) { renderIcon = getIcon; }
export function iconURL(id) { return renderIcon(id); }
