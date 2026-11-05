using System;
using System.Collections.Generic;
using System.Text;

namespace SmartCampus.Application.Common.Exceptions
{
    public sealed class NotFoundException : Exception
    {
        public NotFoundException(string message, string? code = null)
            : base(message)
        {
            Code = code;
        }

        /// <summary>Set when a client must tell this 404 from any other; null for an ordinary one.</summary>
        public string? Code { get; }

        public NotFoundException(string name, object key)
            : base($"{name} with key '{key}' was not found.")
        {
        }
    }
}
