"use client";

import { useState } from "react";
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  GripVertical, 
  Trash2, 
  Plus, 
  Layout, 
  FileText, 
  Image as ImageIcon, 
  Code, 
  List,
  MousePointer2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Widget, WidgetArea } from "@/lib/types";

const availableWidgets: { type: Widget['type']; name: string; icon: any; desc: string }[] = [
  { type: 'search', name: 'Search', icon: Search, desc: 'A search form for your site.' },
  { type: 'recent_posts', name: 'Recent Posts', icon: FileText, desc: 'Your site’s most recent posts.' },
  { type: 'categories', name: 'Categories', icon: List, desc: 'A list or dropdown of categories.' },
  { type: 'custom_html', name: 'Custom HTML', icon: Code, desc: 'Arbitrary HTML code.' },
  { type: 'text', name: 'Text', icon: FileText, desc: 'Arbitrary text or HTML.' },
  { type: 'image', name: 'Image', icon: ImageIcon, desc: 'Displays an image.' },
];

export default function AdminWidgets() {
  const [widgetAreas, setWidgetAreas] = useState<WidgetArea[]>([
    { 
      id: "main-sidebar", 
      name: "Main Sidebar", 
      description: "Appears on the right of your blog posts.",
      widgets: [
        { id: "w-1", type: "search", title: "Search Site", settings: {} },
        { id: "w-2", type: "recent_posts", title: "Latest News", settings: { count: 5 } },
      ]
    },
    { 
      id: "footer-1", 
      name: "Footer Column 1", 
      description: "First column in your site footer.",
      widgets: [
        { id: "w-3", type: "text", title: "About Us", settings: { text: "LCP Auto Cars is your premium tuning partner." } },
      ]
    },
    { 
      id: "footer-2", 
      name: "Footer Column 2", 
      description: "Second column in your site footer.",
      widgets: []
    }
  ]);

  const [expandedWidgets, setExpandedWidgets] = useState<string[]>([]);

  const toggleWidget = (id: string) => {
    setExpandedWidgets(prev => 
      prev.includes(id) ? prev.filter(w => w !== id) : [...prev, id]
    );
  };

  const removeWidget = (areaId: string, widgetId: string) => {
    setWidgetAreas(areas => areas.map(area => {
      if (area.id === areaId) {
        return { ...area, widgets: area.widgets.filter(w => w.id !== widgetId) };
      }
      return area;
    }));
  };

  const addWidget = (areaId: string, type: Widget['type']) => {
    const newWidget: Widget = {
      id: `w-${Date.now()}`,
      type,
      title: availableWidgets.find(w => w.type === type)?.name || "New Widget",
      settings: {}
    };
    
    setWidgetAreas(areas => areas.map(area => {
      if (area.id === areaId) {
        return { ...area, widgets: [...area.widgets, newWidget] };
      }
      return area;
    }));
    toggleWidget(newWidget.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Left Column: Available Widgets */}
        <div className="w-full md:w-1/3 space-y-4">
          <h3 className="font-bold text-sm text-[#1d2327]">Available Widgets</h3>
          <p className="text-xs text-gray-500 mb-4 italic">To activate a widget drag it to a sidebar or click on it to add it to a widget area.</p>
          
          <div className="grid grid-cols-1 gap-2">
            {availableWidgets.map((widget) => (
              <div 
                key={widget.type}
                className="bg-white border border-[#ccd0d4] p-3 hover:border-[#b1b4b6] cursor-move transition-all group flex items-start space-x-3"
              >
                <div className="p-2 bg-gray-50 rounded text-gray-400 group-hover:text-[#2271b1]">
                  <widget.icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-[#1d2327] group-hover:text-[#2271b1]">{widget.name}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">{widget.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Widget Areas */}
        <div className="flex-1 space-y-4">
          <h3 className="font-bold text-sm text-[#1d2327]">Widget Areas</h3>
          
          <div className="space-y-4">
            {widgetAreas.map((area) => (
              <div key={area.id} className="bg-white border border-[#ccd0d4] shadow-sm">
                <div className="px-4 py-3 border-b border-[#ccd0d4] bg-[#f6f7f7] flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm">{area.name}</h4>
                    {area.description && <p className="text-[11px] text-gray-500 mt-0.5">{area.description}</p>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button className="text-[#2271b1] hover:text-[#135e96] transition-colors">
                      <ChevronDown className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <div className="p-4 min-h-[60px] bg-[#f0f0f1]/30 space-y-2">
                  {area.widgets.length > 0 ? (
                    area.widgets.map((widget) => (
                      <div key={widget.id} className="space-y-0.5">
                        <div className="flex items-center bg-white border border-[#ccd0d4] hover:border-[#b1b4b6] cursor-move transition-colors group">
                          <div className="p-2 border-r border-[#ccd0d4] text-gray-400 group-hover:text-gray-600">
                            <GripVertical className="w-4 h-4" />
                          </div>
                          <div className="flex-1 px-3 py-2 flex items-center justify-between text-sm">
                            <span className="font-medium">{widget.title}</span>
                            <span className="text-[10px] text-gray-400 italic uppercase">{widget.type}</span>
                          </div>
                          <button 
                            onClick={() => toggleWidget(widget.id)}
                            className="p-2 border-l border-[#ccd0d4] text-gray-400 hover:text-[#2271b1] transition-colors"
                          >
                            {expandedWidgets.includes(widget.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        </div>
                        
                        {expandedWidgets.includes(widget.id) && (
                          <div className="bg-white border border-[#ccd0d4] border-t-0 p-4 space-y-4 shadow-inner text-xs animate-in slide-in-from-top-2 duration-200">
                            <div>
                              <label className="block mb-1 text-gray-600 font-bold">Title</label>
                              <input 
                                type="text" 
                                className="w-full border border-[#ccd0d4] px-2 py-1.5 outline-none focus:border-[#2271b1]" 
                                defaultValue={widget.title} 
                              />
                            </div>
                            {widget.type === 'recent_posts' && (
                              <div>
                                <label className="block mb-1 text-gray-600 font-bold">Number of posts to show</label>
                                <input 
                                  type="number" 
                                  className="w-20 border border-[#ccd0d4] px-2 py-1.5 outline-none focus:border-[#2271b1]" 
                                  defaultValue={widget.settings.count || 5} 
                                />
                              </div>
                            )}
                            {(widget.type === 'text' || widget.type === 'custom_html') && (
                              <div>
                                <label className="block mb-1 text-gray-600 font-bold">Content</label>
                                <textarea 
                                  className="w-full border border-[#ccd0d4] px-2 py-1.5 outline-none focus:border-[#2271b1] h-32 resize-none" 
                                  defaultValue={widget.settings.text || ""} 
                                />
                              </div>
                            )}
                            <div className="flex items-center justify-between pt-3 border-t border-[#f0f0f1]">
                              <button 
                                onClick={() => removeWidget(area.id, widget.id)}
                                className="text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                              <div className="space-x-3">
                                <button onClick={() => toggleWidget(widget.id)} className="text-gray-500 hover:underline">Close</button>
                                <button className="px-3 py-1 bg-[#2271b1] text-white font-bold rounded shadow-sm hover:bg-[#135e96] transition-colors">Save</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="border-2 border-dashed border-[#ccd0d4] rounded-lg p-6 text-center text-gray-400 text-xs italic">
                      Drag widgets here to add them to this area.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
