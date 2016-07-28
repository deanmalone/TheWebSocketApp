using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;

namespace TheWebSocketApp.Models
{
    public class AppMessage
    {
        public string id { get; set; }
        public string type { get; set; }
        public string content { get; set; }
        public string date { get; set; }
    }
}