import { useNavigate } from "react-router-dom";
import { Sparkles, Plus, Calendar, Bot, ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { mockVendorServices } from "@/data/mock";

export function VendorDashboard() {
  const navigate = useNavigate();

  const totalBookings = mockVendorServices.reduce(
    (sum, s) => sum + s.bookings,
    0
  );

  const activeNegotiations = [
    {
      id: 1,
      customerRequest: "Kitchen sink repair — Palo Alto",
      vendorAgent: "QuickFix Plumbing Agent",
      status: "Negotiating price",
      lastMessage: "Customer agent offered $280. Countering at $295.",
      timestamp: "2 min ago",
    },
    {
      id: 2,
      customerRequest: "Emergency pipe leak — Mountain View",
      vendorAgent: "Emergency Pipe Repair Agent",
      status: "Scheduling",
      lastMessage: "Agreed on $420. Confirming Thursday 10 AM slot.",
      timestamp: "8 min ago",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
              aria-label="Back to home"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-foreground leading-tight">
                  Agent Place
                </h1>
                <p className="text-xs text-muted-foreground">Vendor Portal</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/vendor/calendar")}
            >
              <Calendar className="h-4 w-4 mr-1.5" />
              My calendar
            </Button>
            <Button size="sm" onClick={() => navigate("/vendor/new-service")}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add new service
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Services</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {mockVendorServices.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Total Bookings</p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {totalBookings}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Active Negotiations
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                {activeNegotiations.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Services */}
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-foreground">
            Your Services
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {mockVendorServices.map((service) => (
              <Card key={service.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold leading-snug">
                      {service.name}
                    </CardTitle>
                    <Badge
                      variant={service.active ? "default" : "secondary"}
                      className="ml-2 shrink-0"
                    >
                      {service.active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Rate</span>
                    <span className="font-medium text-foreground">
                      ${service.rate}/hr
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Bookings</span>
                    <span className="font-medium text-foreground">
                      {service.bookings}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Separator />

        {/* Active Negotiations */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold text-foreground">
              Active Negotiations
            </h2>
          </div>
          <div className="space-y-3">
            {activeNegotiations.map((neg) => (
              <Card key={neg.id}>
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">
                        {neg.customerRequest}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {neg.vendorAgent}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 ml-3">
                      {neg.status}
                    </Badge>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground italic">
                      &ldquo;{neg.lastMessage}&rdquo;
                    </p>
                    <span className="text-xs text-muted-foreground/70 shrink-0 ml-4">
                      {neg.timestamp}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
