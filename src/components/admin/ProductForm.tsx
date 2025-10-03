import React from "react";
import MergedProductForm from "@/components/MergedProductForm"; // adjust path if needed
import { useNavigate } from "react-router-dom";

/**
 * Thin wrapper page for admin product form.
 * All admin UI (category image upload, admin flags, create/update) is inside MergedProductForm.
 */
const AdminProductForm: React.FC = () => {
  const navigate = useNavigate();

  // optional: handle product created/updated by admin
  const handleAdminSubmit = (product: any) => {
    console.log("Admin created/updated product:", product);
    // e.g. show a success notification, redirect to product listing
  };

  // MergedProductForm's import resolves to a non-component type (Router) in your build; cast it to a React component type
  const FormComponent = (MergedProductForm as unknown) as React.ComponentType<any>;

  return (
    <div>
      <FormComponent mode="admin" onSubmit={handleAdminSubmit} />
    </div>
  );
};

export default AdminProductForm;
