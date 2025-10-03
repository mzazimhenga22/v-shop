import { HelpCircle, Mail, Phone, MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";

const SupportPage = () => {
  const faqs = [
    {
      question: "How can I track my order?",
      answer: "You can track your order via the Order Tracking page in your account dashboard.",
    },
    {
      question: "How do I apply to become a vendor?",
      answer: "Go to the Vendor Portal and click on 'Apply as Vendor' to start your application.",
    },
    {
      question: "What is your return policy?",
      answer: "You can return items within 7 days if they're in original condition with a valid reason.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-4 text-center">Support Center</h1>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-10">
        Find answers to frequently asked questions or contact our support team.
      </p>

      <div className="space-y-6">
        {faqs.map((faq, index) => (
          <div key={index} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-green-600" />
              {faq.question}
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">{faq.answer}</p>
          </div>
        ))}
      </div>

      {/* Contact Options */}
      <div className="mt-16">
        <h2 className="text-xl font-semibold mb-6 text-center">Still need help?</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="flex items-start gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
            <Mail className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold">Email Support</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">support@Vshop.com</p>
            </div>
          </div>
          <div className="flex items-start gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl shadow">
            <Phone className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold">Call Us</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">+254 712 345 678</p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Link */}
      <div className="mt-10 text-center">
        <Link
          to="/contact"
          className="inline-flex items-center gap-2 text-green-600 hover:text-green-700 font-medium"
        >
          <MessageSquare className="w-5 h-5" />
          Contact Us Directly
        </Link>
      </div>
    </div>
  );
};

export default SupportPage;
