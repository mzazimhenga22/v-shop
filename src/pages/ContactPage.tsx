// pages/ContactPage.tsx
import { Mail, Phone, MapPin } from "lucide-react";

const ContactPage = () => {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-center mb-4">Contact Us</h1>
      <p className="text-center text-gray-600 dark:text-gray-400 mb-10">
        We'd love to hear from you. Reach out via the form or the details below.
      </p>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Contact Form */}
        <form className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Full Name</label>
            <input
              type="text"
              required
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
              type="email"
              required
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Message</label>
            <textarea
              rows={4}
              required
              className="w-full mt-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
            ></textarea>
          </div>
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition"
          >
            Send Message
          </button>
        </form>

        {/* Contact Info */}
        <div className="space-y-6 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-md">
          <div className="flex items-start gap-4">
            <MapPin className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold">Office Address</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">Vshop HQ, Nairobi, Kenya</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Mail className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold">Email</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">support@vshop.com</p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <Phone className="w-6 h-6 text-green-600" />
            <div>
              <h4 className="font-semibold">Phone</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">+254 712 345 678</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactPage;
