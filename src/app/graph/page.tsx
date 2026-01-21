"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Network, Users, Building2, Tag, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// Dynamically import the graph component (no SSR)
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center bg-card rounded-lg">
      <Skeleton className="w-full h-full" />
    </div>
  ),
});

interface GraphNode {
  id: string;
  name: string;
  type: "guest" | "company" | "topic";
  val: number;
  color: string;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const NODE_COLORS = {
  guest: "#000000",
  company: "#666666",
  topic: "#999999",
};

export default function GraphPage() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filter, setFilter] = useState<"all" | "guest" | "company" | "topic">("all");
  const graphRef = useRef<{ zoomToFit: (ms?: number) => void; zoom: (k: number, ms?: number) => void } | null>(null);

  useEffect(() => {
    async function fetchGraphData() {
      try {
        const response = await fetch("/api/graph");
        if (!response.ok) throw new Error("Failed to fetch graph data");
        const data = await response.json();
        setGraphData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchGraphData();
  }, []);

  const filteredData = useCallback(() => {
    if (!graphData || filter === "all") return graphData;

    const filteredNodes = graphData.nodes.filter((node) => node.type === filter);
    const nodeIds = new Set(filteredNodes.map((n) => n.id));

    const filteredLinks = graphData.links.filter(
      (link) =>
        nodeIds.has(typeof link.source === "string" ? link.source : (link.source as { id: string }).id) &&
        nodeIds.has(typeof link.target === "string" ? link.target : (link.target as { id: string }).id)
    );

    return { nodes: filteredNodes, links: filteredLinks };
  }, [graphData, filter]);

  const handleNodeClick = useCallback((node: GraphNode) => {
    setSelectedNode(node);
  }, []);

  const handleZoomIn = () => {
    graphRef.current?.zoom(1.5, 300);
  };

  const handleZoomOut = () => {
    graphRef.current?.zoom(0.67, 300);
  };

  const handleReset = () => {
    graphRef.current?.zoomToFit(400);
    setSelectedNode(null);
  };

  if (loading) {
    return (
      <div className="max-w-content mx-auto px-[3vw] py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Relations Graph</h1>
          <p className="text-muted">
            Loading connections between guests, companies, and topics...
          </p>
        </div>
        <Skeleton className="w-full h-[600px] rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-content mx-auto px-[3vw] py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Relations Graph</h1>
          <p className="text-red-500">Error: {error}</p>
        </div>
      </div>
    );
  }

  const data = filteredData();

  return (
    <div className="max-w-content mx-auto px-[3vw] py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Relations Graph</h1>
        <p className="text-muted">
          Explore connections between guests, companies, and topics from the
          podcast.
        </p>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Filter by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                <Button
                  variant={filter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("all")}
                  className="justify-start"
                >
                  <Network className="h-4 w-4 mr-2" />
                  All
                </Button>
                <Button
                  variant={filter === "guest" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("guest")}
                  className="justify-start"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Guests
                </Button>
                <Button
                  variant={filter === "company" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("company")}
                  className="justify-start"
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Companies
                </Button>
                <Button
                  variant={filter === "topic" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("topic")}
                  className="justify-start"
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Topics
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Controls */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Controls</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Selected Node */}
          {selectedNode && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Selected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium mb-2">{selectedNode.name}</p>
                <Badge variant="outline" className="capitalize">
                  {selectedNode.type}
                </Badge>
              </CardContent>
            </Card>
          )}

          {/* Legend */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS.guest }}
                  />
                  Guests
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS.company }}
                  />
                  Companies
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: NODE_COLORS.topic }}
                  />
                  Topics
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Graph */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-0">
              <div className="w-full h-[600px] rounded-lg overflow-hidden">
                {data && data.nodes.length > 0 ? (
                  <ForceGraph2D
                    // @ts-expect-error - ref type mismatch with dynamic import
                    ref={graphRef}
                    graphData={data}
                    nodeLabel="name"
                    nodeColor={(node) => (node as GraphNode).color}
                    nodeVal={(node) => (node as GraphNode).val}
                    linkColor={() => "#e5e5e5"}
                    linkWidth={1}
                    onNodeClick={(node) => handleNodeClick(node as GraphNode)}
                    backgroundColor="#fafafa"
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      const n = node as GraphNode & { x: number; y: number };
                      const label = n.name;
                      const fontSize = Math.max(12 / globalScale, 3);
                      ctx.font = `${fontSize}px Sans-Serif`;
                      ctx.textAlign = "center";
                      ctx.textBaseline = "middle";

                      // Draw node
                      ctx.beginPath();
                      ctx.arc(n.x, n.y, n.val, 0, 2 * Math.PI, false);
                      ctx.fillStyle = n.color;
                      ctx.fill();

                      // Draw label if zoomed in enough
                      if (globalScale > 0.5) {
                        ctx.fillStyle = "#000";
                        ctx.fillText(label, n.x, n.y + n.val + fontSize);
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-muted">
                      <Network className="h-12 w-12 mx-auto mb-4" />
                      <p>No graph data available.</p>
                      <p className="text-sm mt-2">
                        Run the ingestion scripts to populate the database.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
