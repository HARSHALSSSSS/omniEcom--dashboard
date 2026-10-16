import { useState, useEffect, ChangeEvent } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import { useProduct, useUpdateProduct } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ROUTES } from "@/constants/routes";
import { useToast } from "@/hooks/useToast";
import { formatINR } from "@/utils/format";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: product, isLoading } = useProduct(id || "");
  const updateMutation = useUpdateProduct(id || "");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number>(0);
  const [mrp, setMrp] = useState<number>(0);
  const [category, setCategory] = useState("");
  const [hsnCode, setHsnCode] = useState("");

  const [categoryConfirmOpen, setCategoryConfirmOpen] = useState(false);
  const [pendingCategory, setPendingCategory] = useState("");

  useEffect(() => {
    if (product) {
      setTitle(product.title);
      setDescription(product.description);
      setPrice(product.price);
      setMrp(product.mrp);
      setCategory(product.category);
      setHsnCode(product.hsnCode);
    }
  }, [product]);

  if (isLoading || !product) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Calculate fields changed
  const isTitleChanged = title !== product.title;
  const isDescChanged = description !== product.description;
  const isPriceChanged = price !== product.price;
  const isCategoryChanged = category !== product.category;
  const isHsnChanged = hsnCode !== product.hsnCode;

  const hasAnyChanges =
    isTitleChanged || isDescChanged || isPriceChanged || isCategoryChanged || isHsnChanged;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        title,
        description,
        price,
        mrp,
        category,
        hsnCode,
      });
      toast({
        title: "Product Updated",
        description: "Modifications saved to master catalog and queued for marketplace sync.",
      });
      navigate(`${ROUTES.PRODUCTS}/${product.id}`);
    } catch {
      toast({
        title: "Update Failed",
        description: "Failed to persist changes.",
        variant: "destructive",
      });
    }
  };

  const handleRevert = () => {
    setTitle(product.title);
    setDescription(product.description);
    setPrice(product.price);
    setMrp(product.mrp);
    setCategory(product.category);
    setHsnCode(product.hsnCode);
    toast({ title: "Modifications Reverted" });
  };

  const handleCategoryChangeAttempt = (newCat: string) => {
    setPendingCategory(newCat);
    setCategoryConfirmOpen(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => navigate(`${ROUTES.PRODUCTS}/${product.id}`)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Catalog Editor · {product.sku}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Edit {product.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasAnyChanges && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1.5"
              onClick={handleRevert}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Revert
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5"
            onClick={handleSave}
            disabled={!hasAnyChanges || updateMutation.isPending}
          >
            <Save className="h-3.5 w-3.5" />
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left 2 Cols: Editable Attributes */}
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-foreground">Core Master Details</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Product Title</label>
                <Input
                  value={title}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-foreground block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                      handleCategoryChangeAttempt(e.target.value)
                    }
                    className="w-full text-xs rounded-md border border-input bg-background px-3 py-2"
                  >
                    <option value="Bags & Luggage">Bags & Luggage</option>
                    <option value="Apparel & Fashion">Apparel & Fashion</option>
                    <option value="Home & Kitchen">Home & Kitchen</option>
                    <option value="Electronics">Electronics</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-foreground block mb-1">HSN Code</label>
                  <Input
                    value={hsnCode}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setHsnCode(e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-foreground block mb-1">Description</label>
                <Textarea
                  value={description}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  rows={5}
                  className="text-xs"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-foreground">Selling Price & MRP</h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-foreground block mb-1">Selling Price (₹)</label>
                <Input
                  type="number"
                  value={price}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPrice(Number(e.target.value))}
                  className="text-xs font-semibold"
                />
              </div>
              <div>
                <label className="font-semibold text-foreground block mb-1">MRP (₹)</label>
                <Input
                  type="number"
                  value={mrp}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMrp(Number(e.target.value))}
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Change Impact Analysis Panel (Screen 13) */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5 shadow-xs space-y-4 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="font-bold text-foreground">Channel Impact Analysis</h2>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Modifications made to this master SKU propagate across your connected marketplace
              listings.
            </p>

            <div className="space-y-2.5 pt-2 border-t border-border">
              {product.channels.map((ch) => (
                <div
                  key={ch.channelId}
                  className="rounded-lg border border-border p-3 bg-muted/20 space-y-1"
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>{ch.channelName}</span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      Auto-sync eligible
                    </span>
                  </div>
                  {isPriceChanged && (
                    <div className="text-[11px] text-amber-700">
                      Price will update: {formatINR(product.price)} &rarr; {formatINR(price)}
                    </div>
                  )}
                  {isTitleChanged && (
                    <div className="text-[11px] text-muted-foreground">
                      Listing title will re-validate against {ch.channelName} character limits.
                    </div>
                  )}
                  {!hasAnyChanges && (
                    <div className="text-[11px] text-muted-foreground italic">
                      No pending changes for this channel.
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Category Change Warning Modal */}
      <Dialog open={categoryConfirmOpen} onOpenChange={setCategoryConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              <span>Confirm Category Change</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-xs py-2">
            <p className="text-muted-foreground">
              Changing the master category from <strong>&ldquo;{category}&rdquo;</strong> to{" "}
              <strong>&ldquo;{pendingCategory}&rdquo;</strong> may invalidate category-specific
              attribute mappings on Amazon and Flipkart.
            </p>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-amber-900 text-[11px]">
              You will need to review and remap listing attributes after saving this change.
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setCategoryConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setCategory(pendingCategory);
                setCategoryConfirmOpen(false);
              }}
            >
              Confirm Change
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
