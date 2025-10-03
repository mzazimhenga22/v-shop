import React from "react";
import MergedProductForm from "../components/MergedProductForm"; // adjusted to relative path
import { useNavigate } from "react-router-dom";

/**
 * Thin wrapper page for vendor portal.
 * All vendor UI (profile/banner upload, vendor product list, create/update/delete) is inside MergedProductForm.
 */
const VendorPortalPage: React.FC = () => {
  const navigate = useNavigate();

  // optional: parent-level callback when a product is created/updated (useful to show toast or redirect)
  const handleProductChange = (product: any) => {
    console.log("Vendor product changed:", product);
    // e.g. show a toast, or refresh a product list elsewhere
  };

  // If the imported symbol is typed as a Router (or another non-JSX type), cast it to a React component type.
  const Form = (MergedProductForm as unknown) as React.ComponentType<any>;

  return (
    <div>
      <Form mode="vendor" onSubmit={handleProductChange} />
    </div>
  );
};

export default VendorPortalPage;
