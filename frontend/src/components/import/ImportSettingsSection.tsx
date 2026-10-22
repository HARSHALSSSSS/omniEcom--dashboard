import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import type { DuplicateChoice } from "./wizard/settingsDraft";

interface ImportSettingsSectionProps {
  duplicateStrategy: DuplicateChoice | null;
  onDuplicateStrategyChange: (val: DuplicateChoice) => void;
  importImageUrls: boolean;
  onImportImageUrlsChange: (val: boolean) => void;
  matchVariants: boolean;
  onMatchVariantsChange: (val: boolean) => void;
  importQuantities: boolean;
  onImportQuantitiesChange: (val: boolean) => void;
  onBackToUpload: () => void;
  /** the settings cannot be changed (no write permission, or a validation is running) */
  disabled?: boolean;
  /** more settings of the import, shown in the same card under the switches */
  children?: ReactNode;
}

export function ImportSettingsSection({
  duplicateStrategy,
  onDuplicateStrategyChange,
  importImageUrls,
  onImportImageUrlsChange,
  matchVariants,
  onMatchVariantsChange,
  importQuantities,
  onImportQuantitiesChange,
  onBackToUpload,
  disabled = false,
  children,
}: ImportSettingsSectionProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-12 items-start w-full pt-1">
      {/* Left Settings Form */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        <div>
          <h2 className="text-[23px] leading-[35px] font-semibold text-[#000000] dark:text-white">
            Import settings
          </h2>
          <p className="text-[13px] leading-[20px] font-normal text-[#666666] mt-1">
            Set how your catalog is handled. Review matches before confirming the import.
          </p>
        </div>

        <div className="rounded-[6px] border border-[#E3E3E3] dark:border-border bg-white dark:bg-card p-6 space-y-6">
          {/* Duplicate handling */}
          <div>
            <h4 className="text-[14px] leading-[21px] font-semibold text-[#000000] dark:text-white mb-4">
              Duplicate handling
            </h4>
            <RadioGroup
              value={duplicateStrategy ?? ""}
              onValueChange={(val) => onDuplicateStrategyChange(val as DuplicateChoice)}
              disabled={disabled}
              aria-label="Duplicate handling"
              className="space-y-3"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="update" id="dup-update" />
                <label
                  htmlFor="dup-update"
                  className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
                >
                  Update matching products
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="create_only" id="dup-create" />
                <label
                  htmlFor="dup-create"
                  className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
                >
                  Create new products only
                </label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="ask" id="dup-ask" />
                <label
                  htmlFor="dup-ask"
                  className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
                >
                  Ask me when a match is found
                </label>
              </div>
            </RadioGroup>
            <p className="text-[12px] leading-[18px] text-[#666666] mt-3 pl-7">
              No matching records are merged without your approval.
            </p>
          </div>

          <div className="border-t border-[#E3E3E3] dark:border-border pt-5 space-y-3.5">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="import-images"
                checked={importImageUrls}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onImportImageUrlsChange(checked === true)
                }
              />
              <label
                htmlFor="import-images"
                className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
              >
                Import image URLs
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <Checkbox
                id="match-variants"
                checked={matchVariants}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onMatchVariantsChange(checked === true)
                }
              />
              <label
                htmlFor="match-variants"
                className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
              >
                Automatically group variant options
              </label>
            </div>
            <div className="flex items-center space-x-3">
              <Checkbox
                id="import-quantities"
                checked={importQuantities}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onImportQuantitiesChange(checked === true)
                }
              />
              <label
                htmlFor="import-quantities"
                className="text-[13px] leading-[20px] font-normal text-[#000000] dark:text-white cursor-pointer"
              >
                Import inventory quantities
              </label>
            </div>
          </div>

          {children}
        </div>

        <div>
          <Button
            type="button"
            variant="outline"
            onClick={onBackToUpload}
            className="h-[36px] border border-[#E3E3E3] bg-white dark:bg-card text-[#000000] dark:text-white hover:bg-neutral-50 rounded-[5px] text-[12px] leading-[18px] font-medium"
          >
            Back to upload
          </Button>
        </div>
      </div>

      {/* Right control card with consistent #F6F6F6 styling */}
      <div className="w-full lg:w-[340px] xl:w-[380px] shrink-0 bg-[#F6F6F6] dark:bg-card/40 rounded-[6px] border border-[#E3E3E3] dark:border-border p-6 space-y-3 select-none">
        <h3 className="text-[16px] leading-[24px] font-semibold text-[#000000] dark:text-white">
          You stay in control
        </h3>
        <p className="text-[12px] leading-[18px] text-[#666666] leading-relaxed">
          Automatic matching proposes product, SKU, variant, category and image mappings.
        </p>
        <p className="text-[12px] leading-[18px] text-[#666666] leading-relaxed pt-2">
          Critical information is never invented. Review uncertain matches and choose how duplicates should be handled.
        </p>
      </div>
    </div>
  );
}
