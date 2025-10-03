import React from "react";
import classNames from "classnames";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline";
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = "default",
  ...props
}) => {
  return (
    <button
      className={classNames(
        "px-4 py-2 rounded-full font-medium transition",
        {
          "bg-green-700 text-white hover:bg-green-800": variant === "default",
          "border border-gray-300 text-gray-700 hover:bg-gray-100": variant === "outline",
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};
