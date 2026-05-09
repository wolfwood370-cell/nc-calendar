import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Dumbbell, ArrowRight, Activity, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"client" | "trainer">("client");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    signIn(tab);
    navigate({ to: tab === "trainer" ? "/trainer" : "/client" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/10 via-background to-accent/40 border-r">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Dumbbell className="size-5" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Stride</span>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
            Programmed in 4-week blocks. Booked in seconds.
          </h1>
          <p className="text-muted-foreground">
            A focused studio for personal trainers and their clients — quotas, calendars and
            assessments in one quiet, deliberate workspace.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Card className="p-4">
              <Users className="size-5 text-primary" />
              <p className="mt-3 text-sm font-medium">Client roster</p>
              <p className="text-xs text-muted-foreground">Manage every block and quota.</p>
            </Card>
            <Card className="p-4">
              <Activity className="size-5 text-primary" />
              <p className="mt-3 text-sm font-medium">Assessments</p>
              <p className="text-xs text-muted-foreground">PT, BIA, Functional Tests.</p>
            </Card>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© Stride Studio</p>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-2">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Dumbbell className="size-5" />
            </div>
            <span className="font-display text-xl font-semibold">Stride</span>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Sign in to continue. This is a demo — any email works.
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "client" | "trainer")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="client">I'm a client</TabsTrigger>
              <TabsTrigger value="trainer">I'm a trainer</TabsTrigger>
            </TabsList>
            <TabsContent value="client" className="mt-6">
              <AuthForm onSubmit={submit} placeholder="client@demo.app" cta="Enter client hub" />
            </TabsContent>
            <TabsContent value="trainer" className="mt-6">
              <AuthForm onSubmit={submit} placeholder="trainer@demo.app" cta="Enter studio dashboard" />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function AuthForm({
  onSubmit,
  placeholder,
  cta,
}: {
  onSubmit: (e: React.FormEvent) => void;
  placeholder: string;
  cta: string;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder={placeholder} defaultValue={placeholder} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" placeholder="••••••••" defaultValue="demo1234" required />
      </div>
      <Button type="submit" className="w-full">
        {cta} <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
