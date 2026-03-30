import './Sidebar.css';

interface SidebarProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Sidebar({ visible, title, onClose, children }: SidebarProps) {
  return (
    <div className={`sidebar${visible ? '' : ' sidebar--hidden'}`}>
      <div className="sidebar__header">
        <span className="sidebar__title">{title}</span>
        <button className="sidebar__close" onClick={onClose} title="Close">
          &times;
        </button>
      </div>
      <div className="sidebar__body">{children}</div>
    </div>
  );
}
