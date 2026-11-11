import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, LoaderCircle, MessageCircle, Check, AlertCircle } from "lucide-react";
import { avatarColor, initials } from "../lib/chat.js";

export function IconButton({ label, children, className = "", ...props }) {
  return <button type="button" aria-label={label} title={label} className={`icon-button ${className}`} {...props}>{children}</button>;
}
export function Avatar({ name, size = 46, className = "" }) {
  return <span className={`avatar ${className}`} style={{ width: size, height: size, minWidth: size, background: avatarColor(name), fontSize: size * 0.31 }} aria-hidden="true">{initials(name)}</span>;
}
export function Spinner({ small = false }) { return <LoaderCircle className={`spinner ${small ? "small" : ""}`} size={small ? 16 : 24} aria-label="Loading" />; }
export function EmptyState({ icon: Icon = MessageCircle, title, children }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={28} strokeWidth={1.5} /></span><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}
export function useDialogFocus(ref, onClose) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const frame = requestAnimationFrame(() => (ref.current?.querySelector("[autofocus], [data-dialog-focus]") || ref.current?.querySelector("input, textarea, select, button") || ref.current)?.focus());
    function keys(e) {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current?.(); }
      if (e.key === "Tab") {
        const focusable = [...(ref.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || [])].filter(el => el.offsetParent !== null);
        const first = focusable[0], last = focusable.at(-1);
        if (!first) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === first || !ref.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && (document.activeElement === last || !ref.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", keys, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", keys, true); if (previous?.isConnected) previous.focus?.(); };
  }, []);
}
export function Modal({ title, children, onClose, className = "", footer, wide = false }) {
  const id = useId();
  const ref = useRef(null);
  useDialogFocus(ref, onClose);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id} className={`modal ${wide ? "wide" : ""} ${className}`}>
      <header className="modal-header"><h2 id={id}>{title}</h2><IconButton label="Close dialog" onClick={onClose}><X size={20} /></IconButton></header>
      <div className="modal-body">{children}</div>{footer && <footer className="modal-footer">{footer}</footer>}
    </section>
  </div>;
}
export function Switch({ checked, onChange, label, disabled = false }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={`switch ${checked ? "on" : ""}`}><span /></button>;
}
export function Menu({ items, onClose, className = "" }) {
  const ref = useRef(null), anchor = useRef(null);
  const [position, setPosition] = useState(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useLayoutEffect(() => {
    const a = anchor.current?.getBoundingClientRect(), menu = ref.current;
    if (!a || !menu) return;
    const above = className.includes("attachment-menu");
    const left = Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, above ? a.left : a.right - menu.offsetWidth));
    let top = above ? a.top - menu.offsetHeight - 8 : a.bottom + 5;
    top = Math.max(8, Math.min(window.innerHeight - menu.offsetHeight - 8, top));
    setPosition({ left, top });
    menu.querySelector("button:not([disabled])")?.focus({ preventScroll: true });
  }, [className]);
  useEffect(() => {
    const outside = e => {
      if (!ref.current?.contains(e.target) && !anchor.current?.parentElement?.contains(e.target)) closeRef.current?.();
    };
    const key = e => {
      if (e.key === "Escape") { e.stopPropagation(); closeRef.current?.(); }
      if (e.key === "Tab") closeRef.current?.();
      if (["ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        const buttons = [...(ref.current?.querySelectorAll("button:not([disabled])") || [])];
        const index = buttons.indexOf(document.activeElement);
        buttons[(index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, []);
  return <><span ref={anchor} className={`menu-position-anchor ${className.includes("attachment-menu") ? "above" : ""}`} aria-hidden="true" />{createPortal(<div className={`menu ${className}`} role="menu" ref={ref} style={{ position: "fixed", left: position?.left || 0, top: position?.top || 0, bottom: "auto", right: "auto", visibility: position ? "visible" : "hidden" }}>{items.filter(Boolean).map((item, i) => item.separator ? <div key={i} className="menu-separator" /> : <button type="button" role="menuitem" disabled={item.disabled} key={item.label} className={item.danger ? "danger" : ""} onClick={() => { onClose(); item.action?.(); }}>{item.icon && <item.icon size={17} />}<span>{item.label}</span>{item.hint && <small>{item.hint}</small>}</button>)}</div>, document.body)}</>;
}
export function Toast({ value, onClose }) {
  if (!value) return null;
  return <div className={`toast ${value.error ? "error" : ""}`} role="status" aria-live="polite">{value.error ? <AlertCircle size={18} /> : <Check size={18} />}<span>{value.text}</span><IconButton label="Dismiss notification" onClick={onClose}><X size={16} /></IconButton></div>;
}
export function Field({ label, hint, children }) {
  const id = useId();
  const direct = React.isValidElement(children) && ["input", "textarea", "select"].includes(children.type);
  const control = direct ? React.cloneElement(children, { "aria-labelledby": `${id}-label`, ...(hint ? { "aria-describedby": `${id}-hint` } : {}) }) : children;
  return <label className="field"><span id={`${id}-label`}>{label}</span>{control}{hint && <small id={`${id}-hint`}>{hint}</small>}</label>;
}
