import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { FileText, Plus, LayoutDashboard } from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
}

const AppLayout = ({ children, title }: AppLayoutProps) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="text-lg font-bold text-foreground">E-Parecer</span>
              <span className="ml-1 text-xs text-muted-foreground">v1.0</span>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              to="/"
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              location.pathname === "/" ?
              "bg-primary text-primary-foreground" :
              "text-muted-foreground hover:bg-secondary hover:text-foreground"}`
              }>
              
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
            <Link
              to="/novo"
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              location.pathname === "/novo" ?
              "bg-primary text-primary-foreground" :
              "text-muted-foreground hover:bg-secondary hover:text-foreground"}`
              }>
              
              <Plus className="h-4 w-4" />
              Novo Parecer
            </Link>
          </nav>
        </div>
      </header>
      <main className="container py-8">
        {title &&
        <h1 className="mb-6 text-2xl font-bold text-foreground">{title}</h1>
        }
        {children}
      </main>
    </div>);

};

export default AppLayout;